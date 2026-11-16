// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	PersonalMessages,
	type PublicProposal,
} from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { toBase64 } from '@mysten/sui/utils';
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

/** A proposal from the account's external proposer, with both events. */
async function externalProposal(
	signedBy?: Ed25519Keypair,
): Promise<PublicProposal> {
	const { account, proposer, proposerKey } =
		await accountWithProposer();
	const bytes = new Uint8Array([1, 2, 3, 4]);
	const digest = 'digest';
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
	).toBe('unconfirmed');
});

test('a proposal from before the audit log with a confirmed proposer is not flagged', async () => {
	const proposal = await externalProposal();

	expect(
		await checkProposalProposer({
			...proposal,
			events: {
				created: null,
				proposer: proposal.events!.proposer,
			},
		}),
	).toBeNull();
});

test('a member proposer is not flagged', async () => {
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
	).toBeNull();
});
