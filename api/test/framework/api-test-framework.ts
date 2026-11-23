// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	defaultExpiry,
	PersonalMessages,
	SagatClient,
	type MultisigWithMembers,
	type SagatApiError,
} from '@mysten/sagat';
import {
	SagatV1Client,
	type Network,
	type Proposal,
} from '@mysten/sagat/v1';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import {
	fromBase64,
	MIST_PER_SUI,
} from '@mysten/sui/utils';
import { expect } from 'bun:test';
import { type Hono } from 'hono';

import {
	combinedSignature,
	execute,
} from '../setup/localnet-transactions';
import {
	executeTransaction,
	fundAddress,
	getLocalClient,
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

// The user's signature over the transaction.
export const signedBy = async (
	user: TestUser,
	transactionBytes: string,
) =>
	(
		await user.keypair.signTransaction(
			fromBase64(transactionBytes),
		)
	).signature;

// The status and JSON body of an error response, to assert both at once.
export const errorOf = async (response: Response) => ({
	status: response.status,
	body: await response.json(),
});

// Expects `fulfilled` successes, and every other result to fail with
// `rejectedWith`.
export const expectSettled = (
	results: PromiseSettledResult<unknown>[],
	{
		fulfilled,
		rejectedWith,
	}: { fulfilled: number; rejectedWith: string },
) => {
	expect(
		results.filter((r) => r.status === 'fulfilled'),
	).toHaveLength(fulfilled);
	for (const result of results)
		if (result.status === 'rejected')
			expect((result.reason as Error).message).toContain(
				rejectedWith,
			);
};

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

// Combines the proposal's signatures from the members of `signerSet`,
// executes the transaction on the local chain and waits for it.
export async function executeProposal(
	{
		transactionBytes,
		signatures,
	}: {
		transactionBytes: string;
		signatures: { publicKey: string; signature: string }[];
	},
	signerSet: Parameters<typeof combinedSignature>[0],
) {
	const result = await execute(
		fromBase64(transactionBytes),
		combinedSignature(signerSet, signatures),
	);
	return result.$kind === 'Transaction'
		? result.Transaction
		: result.FailedTransaction;
}

// A client call's refusal as status and message, or null when it succeeds.
export const refusal = (call: Promise<unknown>) =>
	call.then(
		() => null,
		(error: SagatApiError) => ({
			status: error.status,
			message: error.message,
		}),
	);

// A client for the API (calling the app directly), that keeps the session
// cookie between requests like a browser would.
export class TestSession {
	#cookie = '';
	readonly client: SagatClient;
	readonly v1: SagatV1Client;

	readonly #app: Hono;

	constructor(app: Hono) {
		this.#app = app;
		this.client = new SagatClient(
			'',
			'cookie',
			(url, init) => this.request(url as string, init),
		);
		this.v1 = new SagatV1Client('', {
			fetch: (url, init) =>
				this.request(url as string, init),
		});
	}

	// A request with the session cookie, returning the raw response (the
	// client hides the status code).
	async request(path: string, init?: RequestInit) {
		const headers = new Headers(init?.headers);
		if (this.#cookie) headers.set('Cookie', this.#cookie);
		const response = await this.#app.request(path, {
			...init,
			headers,
		});
		const cookie = response.headers
			.get('set-cookie')
			?.match(/__Host-connected-wallet=([^;]*)/);
		if (cookie) this.#cookie = cookie[1] ? cookie[0] : '';
		return response;
	}

	get cookie() {
		return this.#cookie;
	}

	// A raw JSON POST with the session cookie.
	post(path: string, body: unknown) {
		return this.request(path, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
	}

	async connectUser(user: TestUser) {
		const expiry = defaultExpiry();
		await this.client.connect(
			await sign(user, PersonalMessages.connect(expiry)),
			expiry,
		);
	}

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

	async createProposal(
		proposer: TestUser,
		multisigAddress: string,
		network: Network,
		transactionBytes: string,
		description?: string,
	) {
		return this.v1.createProposal({
			accountAddress: multisigAddress,
			network,
			transactionBytes,
			signature: await signedBy(proposer, transactionBytes),
			description,
		});
	}

	async proposeTransfer(
		proposer: TestUser,
		multisigAddress: string,
		description?: string,
	) {
		return this.createProposal(
			proposer,
			multisigAddress,
			'localnet',
			await buildTransfer(multisigAddress),
			description,
		);
	}

	async voteOnProposal(
		voter: TestUser,
		digest: string,
		transactionBytes: string,
	) {
		return this.v1.voteForProposal(digest, {
			signature: await signedBy(voter, transactionBytes),
		});
	}

	// Collects the votes still needed from `voters`, executes the proposal
	// on chain with a signer set that reached its threshold and verifies it
	// through the API.
	async voteAndExecute(voters: TestUser[], digest: string) {
		const proposal =
			await this.v1.getProposalByDigest(digest);
		for (const voter of voters) {
			if (
				proposal.signatures.some(
					(sig) => sig.publicKey === voter.publicKey,
				)
			)
				continue;
			const { hasReachedThreshold } =
				await this.voteOnProposal(
					voter,
					digest,
					proposal.transactionBytes,
				);
			if (hasReachedThreshold) break;
		}

		const voted = await this.v1.getProposalByDigest(digest);
		const signerSet = voted.signerSets.find(
			(set) => set.hasReachedThreshold,
		);
		if (!signerSet)
			throw new Error(
				'No signer set reached its threshold',
			);
		const tx = await executeProposal(voted, signerSet);
		await this.v1.verifyProposalByDigest(digest);
		return tx;
	}

	async cancelProposal(
		member: TestUser,
		proposal: Pick<Proposal, 'digest' | 'accountAddress'>,
	) {
		return this.v1.cancelProposal(proposal.digest, {
			signature: await sign(
				member,
				PersonalMessages.cancelProposal(
					proposal.digest,
					proposal.accountAddress,
				),
			),
		});
	}
}

export class ApiTestFramework {
	constructor(private app: Hono) {}

	createSession() {
		return new TestSession(this.app);
	}

	// A session with `users` connected.
	async connectedSession(...users: TestUser[]) {
		const session = this.createSession();
		for (const user of users)
			await session.connectUser(user);
		return session;
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

	async createVerifiedMultisig(
		userCount: number,
		threshold: number,
		fund = false,
	): Promise<{
		session: TestSession;
		users: TestUser[];
		multisig: MultisigWithMembers;
	}> {
		const { session, users } =
			await this.createAuthenticatedSession(userCount);
		const multisig = await session.createMultisig(
			users,
			threshold,
			{ fund },
		);
		// Members connected to the session are accepted on creation, but
		// only an accept verifies the multisig.
		for (const user of users.slice(1))
			await session.acceptMultisig(user, multisig.address);
		return { session, users, multisig };
	}

	createFundedVerifiedMultisig(
		userCount: number,
		threshold: number,
	) {
		return this.createVerifiedMultisig(
			userCount,
			threshold,
			true,
		);
	}
}
