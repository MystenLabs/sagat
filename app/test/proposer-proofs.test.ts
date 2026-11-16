// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	PersonalMessages,
	type PublicProposal,
} from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import {
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import { toBase58, toBase64 } from '@mysten/sui/utils';
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';
import { expect, test } from 'vitest';

import {
	checkProposalProposer,
	verifyProposers,
} from '../src/lib/proposer-proofs';

async function accountWithProposer() {
	const keys = [new Ed25519Keypair(), new Ed25519Keypair()];
	const threshold = 1;
	const address = MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: keys.map((key) => ({
			publicKey: key.getPublicKey(),
			weight: 1,
		})),
	}).toSuiAddress();
	const proposerKey = new Ed25519Keypair();
	const proposer = proposerKey.toSuiAddress();
	const expiry = '2026-11-16T10:00:00.000Z';
	const { signature } = await keys[0].signPersonalMessage(
		new TextEncoder().encode(
			PersonalMessages.addMultisigProposer(
				proposer,
				address,
				expiry,
			),
		),
	);
	return {
		keys,
		signer: keys[0].toSuiAddress(),
		proposer,
		proposerKey,
		account: {
			address,
			threshold,
			members: keys.map((key, order) => ({
				publicKey: key.getPublicKey().toSuiPublicKey(),
				weight: 1,
				order,
			})),
			proposers: [
				{
					address: proposer,
					addedBy: keys[0].toSuiAddress(),
					addedAt: '2026-11-16T09:55:00.000Z',
					event: {
						id: 1,
						action: 'proposer.added',
						actor: keys[0].toSuiAddress(),
						subject: proposer,
						proof: {
							kind: 'proposer.add',
							version: 1,
							signature,
							expiry,
						},
						createdAt: '2026-11-16T09:55:00.000Z',
					},
				},
			],
		},
	};
}

test('a signer of the account confirms a proposer', async () => {
	const { account, proposer, signer } =
		await accountWithProposer();

	const proof = (await verifyProposers(account)).get(
		proposer,
	);

	expect(proof?.status).toBe('verified');
	expect(proof?.signer).toBe(signer);
});

test('signers that do not make up the account confirm no one', async () => {
	const { account, proposer } = await accountWithProposer();

	const proof = (
		await verifyProposers({ ...account, threshold: 2 })
	).get(proposer);

	expect(proof?.status).toBe('unverified');
});

/** A transfer's bytes from `sender`, with their digest. */
async function transfer(sender: string) {
	const tx = new Transaction();
	tx.setSender(sender);
	tx.setGasPayment([
		{
			objectId: '0x2',
			version: '1',
			digest: toBase58(new Uint8Array(32)),
		},
	]);
	tx.setGasPrice(1000);
	tx.setGasBudget(10_000_000);
	tx.transferObjects([tx.gas], '0x3');
	const bytes = await tx.build();
	return {
		bytes,
		digest:
			TransactionDataBuilder.getDigestFromBytes(bytes),
	};
}

/** A proposal from the account's external proposer, with both events. */
async function externalProposal(
	signedBy?: Ed25519Keypair,
): Promise<PublicProposal> {
	const { account, proposer, proposerKey } =
		await accountWithProposer();
	const { bytes, digest } = await transfer(account.address);
	const { signature } = await (
		signedBy ?? proposerKey
	).signTransaction(bytes);
	return {
		digest,
		transactionBytes: toBase64(bytes),
		proposerAddress: proposer,
		multisigAddress: account.address,
		multisig: {
			address: account.address,
			threshold: account.threshold,
			members: account.members,
		},
		events: {
			created: {
				id: 2,
				action: 'proposal.created',
				actor: proposer,
				subject: digest,
				proof: {
					kind: 'proposal.create',
					version: 1,
					signature,
				},
				createdAt: '2026-11-16T10:00:00.000Z',
			},
			proposer: account.proposers[0].event,
		},
	} as PublicProposal;
}

test('a proposal signed by a key other than its proposer is invalid', async () => {
	const proposal = await externalProposal(
		new Ed25519Keypair(),
	);

	expect(await checkProposalProposer(proposal)).toBe(
		'invalid',
	);
});

test('a proposal claiming a member as proposer, signed by someone else, is invalid', async () => {
	const proposal = await externalProposal();
	const member = publicKeyFromSuiBytes(
		proposal.multisig.members[0].publicKey,
	).toSuiAddress();
	const created = proposal.events!.created!;

	expect(
		await checkProposalProposer({
			...proposal,
			proposerAddress: member,
			events: {
				...proposal.events!,
				created: { ...created, actor: member },
			},
		}),
	).toBe('invalid');
});

test('a proposal whose signers do not make up its account is not confirmed', async () => {
	const proposal = await externalProposal();

	expect(
		await checkProposalProposer({
			...proposal,
			multisig: { ...proposal.multisig, threshold: 2 },
		}),
	).toBe('unverified');
});

test('an external proposer without a confirmation is unconfirmed', async () => {
	const proposal = await externalProposal();

	expect(
		await checkProposalProposer({
			...proposal,
			events: {
				created: proposal.events!.created,
				proposer: null,
			},
		}),
	).toBe('unverified');
});

test('a proposal from before the audit log with a confirmed proposer is flagged', async () => {
	const proposal = await externalProposal();

	expect(
		await checkProposalProposer({
			...proposal,
			events: {
				created: null,
				proposer: proposal.events!.proposer,
			},
		}),
	).toBe('unverified');
});

test('a member proposer without their signature is flagged', async () => {
	const { account, keys } = await accountWithProposer();

	expect(
		await checkProposalProposer({
			digest: 'digest',
			transactionBytes: toBase64(new Uint8Array([1])),
			proposerAddress: keys[1].toSuiAddress(),
			multisigAddress: account.address,
			multisig: {
				address: account.address,
				threshold: account.threshold,
				members: account.members,
			},
			events: { created: null, proposer: null },
		} as PublicProposal),
	).toBe('unverified');
});

test('a member proposer who signed the proposal is not flagged', async () => {
	const { account, keys } = await accountWithProposer();
	const { bytes, digest } = await transfer(account.address);
	const { signature } =
		await keys[1].signTransaction(bytes);

	expect(
		await checkProposalProposer({
			digest,
			transactionBytes: toBase64(bytes),
			proposerAddress: keys[1].toSuiAddress(),
			multisigAddress: account.address,
			multisig: {
				address: account.address,
				threshold: account.threshold,
				members: account.members,
			},
			signatures: [
				{
					proposalId: 1,
					publicKey: keys[1]
						.getPublicKey()
						.toSuiPublicKey(),
					signature,
				},
			],
			events: { created: null, proposer: null },
		} as PublicProposal),
	).toBeNull();
});
