// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersonalMessages } from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { expect, test } from 'vitest';

import { verifyProposers } from '../src/lib/proposer-proofs';

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
	const proposer = new Ed25519Keypair().toSuiAddress();
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
		signer: keys[0].toSuiAddress(),
		proposer,
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

	expect(proof?.status).not.toBe('verified');
});
