// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ApiClient,
	PersonalMessages as V1Messages,
	type Account,
} from '@mysten/sagat';
import {
	defaultExpiry,
	PersonalMessages,
	SagatClient,
} from '@mysten/sagat-legacy';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { Transaction } from '@mysten/sui/transactions';
import {
	fromBase64,
	MIST_PER_SUI,
} from '@mysten/sui/utils';
import { type Hono } from 'hono';

import { parsePublicKey } from '../../src/utils/pubKey';
import {
	executeTransaction,
	fundAddress,
	getLocalClient,
	LOCALNET_WAIT,
} from '../setup/sui-network';

const client = getLocalClient();

export interface TestUser {
	keypair: Ed25519Keypair;
	publicKey: string;
	address: string;
}

export const newUser = (): TestUser => {
	const keypair = new Ed25519Keypair();
	return {
		keypair,
		publicKey: keypair.getPublicKey().toSuiPublicKey(),
		address: keypair.toSuiAddress(),
	};
};

export const sign = async (
	user: TestUser,
	message: string,
) =>
	(
		await user.keypair.signPersonalMessage(
			new TextEncoder().encode(message),
		)
	).signature;

// The status and message of an SDK call that must fail.
export const failureOf = (call: Promise<unknown>) =>
	call.then(
		() => {
			throw new Error('Expected the call to fail');
		},
		(error: { status: number; message: string }) => ({
			status: error.status,
			message: error.message,
		}),
	);

// A transfer of `amount` MIST from `sender` back to itself, paying for gas
// with `gasCoin` if given (so proposals using different coins don't collide).
export async function buildTransfer(
	sender: string,
	{
		amount = 1_000_000,
		gasCoin,
	}: {
		amount?: number;
		gasCoin?: {
			objectId: string;
			version: string;
			digest: string;
		};
	} = {},
) {
	const tx = new Transaction();
	tx.setSender(sender);
	if (gasCoin) tx.setGasPayment([gasCoin]);
	const [coin] = tx.splitCoins(tx.gas, [amount]);
	tx.transferObjects([coin], sender);
	return (await tx.build({ client })).toBase64();
}

// Sends `count` coins of 0.1 SUI each to `recipient`.
export async function sendCoins(
	recipient: string,
	count: number,
) {
	const funder = new Ed25519Keypair();
	await fundAddress(funder.toSuiAddress());

	const tx = new Transaction();
	for (let i = 0; i < count; i++) {
		tx.moveCall({
			target: '0x2::pay::split_and_transfer',
			arguments: [
				tx.gas,
				tx.pure.u64(MIST_PER_SUI / 10n),
				tx.pure.address(recipient),
			],
			typeArguments: ['0x2::sui::SUI'],
		});
	}
	await executeTransaction(funder, tx);
}

// Executes transaction bytes with `signatures` on the local network and
// waits for the node to index it. Returns the transaction, failed or not.
export async function executeSigned(
	transactionBytes: string,
	signatures: string[],
) {
	const result = await client.executeTransaction({
		transaction: fromBase64(transactionBytes),
		signatures,
		include: { effects: true },
	});
	const tx =
		result.$kind === 'Transaction'
			? result.Transaction
			: result.FailedTransaction;
	await client.waitForTransaction({
		digest: tx.digest,
		...LOCALNET_WAIT,
	});
	return tx;
}

// Runs a verify call until the API sees the transaction. The API reads the
// chain through its own client, which can lag the one that executed for a
// few seconds, so "not executed yet" is retried for up to 15 seconds.
export async function untilIndexed<T>(
	verify: () => Promise<T>,
) {
	for (let attempt = 0; ; attempt++) {
		try {
			return await verify();
		} catch (error) {
			if (
				attempt >= 60 ||
				!(error instanceof Error) ||
				!error.message.includes('not been executed yet')
			)
				throw error;
			await new Promise((r) => setTimeout(r, 250));
		}
	}
}

// A client for the API (calling the app directly), that keeps the session
// cookie between requests like a browser would. `v1` is the new SDK, for
// the `/v1` routes; `client` is the legacy SDK, for the legacy routes.
// Both share the cookie, so a session connected through either is
// authenticated for both.
export class TestSession {
	#cookie = '';
	readonly client: SagatClient;
	readonly v1: ApiClient;

	readonly #app: Hono;

	constructor(app: Hono) {
		this.#app = app;
		this.client = new SagatClient(
			'',
			'cookie',
			(url, init) => this.request(url as string, init),
		);
		this.v1 = new ApiClient({
			apiUrl: 'http://localhost',
			fetch: (request) => this.request(request),
		});
	}

	// A request with the session cookie, returning the raw response (the
	// clients hide the status code).
	async request(
		input: string | Request,
		init?: RequestInit,
	) {
		const headers = new Headers(
			input instanceof Request
				? input.headers
				: init?.headers,
		);
		if (this.#cookie) headers.set('Cookie', this.#cookie);
		const response = await this.#app.request(input, {
			...init,
			headers,
		});
		const cookie = response.headers
			.get('set-cookie')
			?.match(/connected-wallet=([^;]*)/);
		if (cookie) this.#cookie = cookie[1] ? cookie[0] : '';
		return response;
	}

	async connectUser(user: TestUser) {
		const expiry = defaultExpiry();
		await this.client.connect(
			await sign(user, PersonalMessages.connect(expiry)),
			expiry,
		);
	}

	// `/v1` helpers, through `v1`.

	async createSignerSet(
		members: TestUser[],
		threshold: number,
		{
			weights = members.map(() => 1),
			name,
			labels,
			fund = false,
		}: {
			weights?: number[];
			name?: string;
			labels?: (string | null)[];
			fund?: boolean;
		} = {},
	) {
		const account = await this.v1.createSignerSet({
			publicKeys: members.map((m) => m.publicKey),
			weights,
			threshold,
			name,
			labels,
		});
		if (fund) await fundAddress(account.address);
		return account;
	}

	async acceptSignerSet(
		member: TestUser,
		signerSetAddress: string,
	) {
		return this.v1.acceptSignerSetInvite(signerSetAddress, {
			signature: await sign(
				member,
				V1Messages.acceptSignerSetInvitation(
					signerSetAddress,
				),
			),
		});
	}

	async rejectSignerSet(
		member: TestUser,
		signerSetAddress: string,
	) {
		return this.v1.rejectSignerSetInvite(signerSetAddress, {
			signature: await sign(
				member,
				V1Messages.rejectSignerSetInvitation(
					signerSetAddress,
				),
			),
		});
	}

	async addAccountProposer(
		member: TestUser,
		proposer: string,
		accountAddress: string,
		expiry = defaultExpiry(),
	) {
		return this.v1.addAccountProposer(
			accountAddress,
			proposer,
			await sign(
				member,
				V1Messages.addAccountProposer(
					proposer,
					accountAddress,
					expiry,
				),
			),
			expiry,
		);
	}

	async removeAccountProposer(
		member: TestUser,
		proposer: string,
		accountAddress: string,
	) {
		const expiry = defaultExpiry();
		return this.v1.removeAccountProposer(
			accountAddress,
			proposer,
			await sign(
				member,
				V1Messages.removeAccountProposer(
					proposer,
					accountAddress,
					expiry,
				),
			),
			expiry,
		);
	}

	async createProposal(
		proposer: TestUser,
		accountAddress: string,
		network: string,
		transactionBytes: string,
		description?: string,
	) {
		const { signature } =
			await proposer.keypair.signTransaction(
				fromBase64(transactionBytes),
			);
		return this.v1.createProposal({
			accountAddress,
			network,
			transactionBytes,
			signature,
			description,
		});
	}

	async proposeTransfer(
		proposer: TestUser,
		accountAddress: string,
		description?: string,
	) {
		return this.createProposal(
			proposer,
			accountAddress,
			'localnet',
			await buildTransfer(accountAddress),
			description,
		);
	}

	async voteOnProposal(
		voter: TestUser,
		proposalId: number,
		transactionBytes: string,
	) {
		const { signature } =
			await voter.keypair.signTransaction(
				fromBase64(transactionBytes),
			);
		return this.v1.voteForProposal(proposalId, {
			signature,
		});
	}

	// Collects the votes still needed from `voters`, executes the proposal
	// on chain with a signer set that reached its threshold (as
	// docs/migration-guide.md describes: `via` names it, else the first one)
	// and verifies it through the API.
	async voteAndExecute(
		voters: TestUser[],
		digest: string,
		{ via }: { via?: string } = {},
	) {
		const ready = (sets: string[]) =>
			via ? sets.includes(via) : sets.length > 0;
		const proposal =
			await this.v1.getProposalByDigest(digest);
		for (const voter of voters) {
			if (
				proposal.signatures.some(
					(sig) => sig.publicKey === voter.publicKey,
				)
			)
				continue;
			const { readySignerSets } = await this.voteOnProposal(
				voter,
				proposal.id,
				proposal.transactionBytes,
			);
			if (ready(readySignerSets)) break;
		}

		const { signerSets } =
			await this.v1.getProposalByDigest(digest);
		const set = signerSets.find(
			(s) =>
				s.hasReachedThreshold &&
				(!via || s.address === via),
		);
		if (!set)
			throw new Error(
				'No signer set has reached its threshold',
			);
		const tx = await this.executeProposal(digest, set);
		await this.verifyByDigest(digest);
		return tx;
	}

	// Executes a proposal on chain with the combined signature of `set`,
	// from the signatures collected so far, without verifying it.
	async executeProposal(
		digest: string,
		set: {
			threshold: number;
			members: {
				publicKey: string;
				weight: number;
				order: number;
			}[];
		},
	) {
		const { signatures, transactionBytes } =
			await this.v1.getProposalByDigest(digest);
		const members = [...set.members].sort(
			(a, b) => a.order - b.order,
		);
		const signerSetKey = MultiSigPublicKey.fromPublicKeys({
			threshold: set.threshold,
			publicKeys: members.map((m) => ({
				publicKey: parsePublicKey(m.publicKey),
				weight: m.weight,
			})),
		});
		return executeSigned(transactionBytes, [
			signerSetKey.combinePartialSignatures(
				members.flatMap(
					(m) =>
						signatures.find(
							(sig) => sig.publicKey === m.publicKey,
						)?.signature ?? [],
				),
			),
		]);
	}

	// Verifies an executed proposal by digest, with no session needed.
	verifyByDigest(digest: string) {
		return untilIndexed(() =>
			this.v1.verifyProposalByDigest(digest),
		);
	}

	// Verifies an executed proposal with this session.
	verify(proposalId: number) {
		return untilIndexed(() =>
			this.v1.verifyProposal(proposalId),
		);
	}

	async cancelProposal(
		member: TestUser,
		proposalId: number,
	) {
		return this.v1.cancelProposal(proposalId, {
			signature: await sign(
				member,
				V1Messages.cancelProposal(proposalId),
			),
		});
	}

	// Legacy helpers, through `client`.

	async createMultisig(
		members: TestUser[],
		threshold: number,
		{
			weights = members.map(() => 1),
			name,
			labels,
			fund = false,
		}: {
			weights?: number[];
			name?: string;
			labels?: (string | null)[];
			fund?: boolean;
		} = {},
	) {
		const multisig = await this.client.createMultisig({
			publicKeys: members.map((m) => m.publicKey),
			weights,
			threshold,
			name,
			labels,
		});
		if (fund) await fundAddress(multisig.address);
		return multisig;
	}

	async acceptMultisig(
		member: TestUser,
		multisigAddress: string,
	) {
		return this.client.acceptMultisigInvite(
			multisigAddress,
			{
				signature: await sign(
					member,
					PersonalMessages.acceptMultisigInvitation(
						multisigAddress,
					),
				),
			},
		);
	}

	async rejectMultisig(
		member: TestUser,
		multisigAddress: string,
	) {
		return this.client.rejectMultisigInvite(
			multisigAddress,
			{
				signature: await sign(
					member,
					PersonalMessages.rejectMultisigInvitation(
						multisigAddress,
					),
				),
			},
		);
	}

	async addProposer(
		member: TestUser,
		proposer: string,
		multisigAddress: string,
		expiry = defaultExpiry(),
	) {
		await this.client.addMultisigProposer(
			multisigAddress,
			proposer,
			await sign(
				member,
				PersonalMessages.addMultisigProposer(
					proposer,
					multisigAddress,
					expiry,
				),
			),
			expiry,
		);
	}

	async removeProposer(
		member: TestUser,
		proposer: string,
		multisigAddress: string,
	) {
		const expiry = defaultExpiry();
		await this.client.removeMultisigProposer(
			multisigAddress,
			proposer,
			await sign(
				member,
				PersonalMessages.removeMultisigProposer(
					proposer,
					multisigAddress,
					expiry,
				),
			),
			expiry,
		);
	}

	async legacyCreateProposal(
		proposer: TestUser,
		multisigAddress: string,
		network: string,
		transactionBytes: string,
		description?: string,
	) {
		const { signature } =
			await proposer.keypair.signTransaction(
				fromBase64(transactionBytes),
			);
		return this.client.createProposal({
			multisigAddress,
			network,
			transactionBytes,
			signature,
			description,
		});
	}

	async legacyVoteOnProposal(
		voter: TestUser,
		proposalId: number,
		transactionBytes: string,
	) {
		const { signature } =
			await voter.keypair.signTransaction(
				fromBase64(transactionBytes),
			);
		return this.client.voteForProposal(proposalId, {
			signature,
		});
	}

	async legacyCancelProposal(
		member: TestUser,
		proposalId: number,
	) {
		return this.client.cancelProposal(proposalId, {
			signature: await sign(
				member,
				PersonalMessages.cancelProposal(proposalId),
			),
		});
	}
}

export class ApiTestFramework {
	constructor(private app: Hono) {}

	createSession() {
		return new TestSession(this.app);
	}

	async createAuthenticatedSession(userCount: number) {
		const session = this.createSession();
		const users = Array.from(
			{ length: userCount },
			newUser,
		);
		for (const user of users)
			await session.connectUser(user);
		return { session, users };
	}

	// An account whose original signer set has every user as a member, all
	// accepted, created through `/v1`.
	async createVerifiedAccount(
		userCount: number,
		threshold: number,
		fund = false,
	): Promise<{
		session: TestSession;
		users: TestUser[];
		account: Account;
	}> {
		const { session, users } =
			await this.createAuthenticatedSession(userCount);
		const created = await session.createSignerSet(
			users,
			threshold,
			{ fund },
		);
		for (const user of users.slice(1))
			await session.acceptSignerSet(user, created.address);
		const account = await session.v1.getAccount(
			created.address,
		);
		return { session, users, account };
	}

	createFundedVerifiedAccount(
		userCount: number,
		threshold: number,
	) {
		return this.createVerifiedAccount(
			userCount,
			threshold,
			true,
		);
	}
}
