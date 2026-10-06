// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	defaultExpiry,
	PersonalMessages,
	SagatClient,
	type MultisigWithMembers,
} from '@mysten/sagat';
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

const sign = async (user: TestUser, message: string) =>
	(
		await user.keypair.signPersonalMessage(
			new TextEncoder().encode(message),
		)
	).signature;

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

// Combines members' signatures into the multisig's signature (they have to
// be in the members' order).
export function multisigSignature(
	multisig: {
		threshold: number;
		members: {
			publicKey: string;
			weight: number;
			order: number;
		}[];
	},
	signatures: { publicKey: string; signature: string }[],
) {
	const members = [...multisig.members].sort(
		(a, b) => a.order - b.order,
	);
	const multisigKey = MultiSigPublicKey.fromPublicKeys({
		threshold: multisig.threshold,
		publicKeys: members.map((m) => ({
			publicKey: parsePublicKey(m.publicKey),
			weight: m.weight,
		})),
	});
	return multisigKey.combinePartialSignatures(
		members.flatMap(
			(m) =>
				signatures.find(
					(sig) => sig.publicKey === m.publicKey,
				)?.signature ?? [],
		),
	);
}

// A client for the API (calling the app directly), that keeps the session
// cookie between requests like a browser would.
export class TestSession {
	#cookie = '';
	readonly client: SagatClient;

	constructor(app: Hono) {
		this.client = new SagatClient(
			'',
			'cookie',
			async (url, init) => {
				const headers = new Headers(init?.headers);
				if (this.#cookie)
					headers.set('Cookie', this.#cookie);
				const response = await app.request(url as string, {
					...init,
					headers,
				});
				const cookie = response.headers
					.get('set-cookie')
					?.match(/connected-wallet=([^;]*)/);
				if (cookie)
					this.#cookie = cookie[1] ? cookie[0] : '';
				return response;
			},
		);
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
			fund = false,
		}: {
			weights?: number[];
			name?: string;
			fund?: boolean;
		} = {},
	) {
		const multisig = await this.client.createMultisig({
			publicKeys: members.map((m) => m.publicKey),
			weights,
			threshold,
			name,
		});
		if (fund) await fundAddress(multisig.address);
		return multisig;
	}

	async acceptMultisig(
		member: TestUser,
		multisigAddress: string,
	) {
		await this.client.acceptMultisigInvite(
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

	// Collects the votes still needed from `voters`, executes the proposal
	// on chain and verifies it through the API.
	async voteAndExecute(voters: TestUser[], digest: string) {
		const proposal =
			await this.client.getProposalByDigest(digest);
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
					proposal.id,
					proposal.transactionBytes,
				);
			if (hasReachedThreshold) break;
		}

		const { multisig, signatures, transactionBytes } =
			await this.client.getProposalByDigest(digest);
		const result = await client.executeTransaction({
			transaction: fromBase64(transactionBytes),
			signatures: [multisigSignature(multisig, signatures)],
			include: { effects: true },
		});
		const tx =
			result.$kind === 'Transaction'
				? result.Transaction
				: result.FailedTransaction;
		await client.waitForTransaction({ digest: tx.digest });
		await this.client.verifyProposalByDigest(digest);
		return tx;
	}

	async cancelProposal(
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
