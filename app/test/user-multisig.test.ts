// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type MultisigWithMembers } from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { expect, test } from 'vitest';

import {
	toUserMultisig,
	withActing,
} from '../src/lib/user-multisig';

function pod() {
	const keys = [new Ed25519Keypair(), new Ed25519Keypair()];
	const threshold = 1;
	const address = MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: keys.map((key) => ({
			publicKey: key.getPublicKey(),
			weight: 1,
		})),
	}).toSuiAddress();
	const multisig = {
		address,
		threshold,
		name: null,
		members: keys.map((key, order) => ({
			publicKey: key.getPublicKey().toSuiPublicKey(),
			weight: 1,
			order,
			isAccepted: true,
			isRejected: false,
		})),
	} as unknown as MultisigWithMembers;
	const signer = {
		publicKey: keys[0].getPublicKey().toSuiPublicKey(),
		address: keys[0].toSuiAddress(),
	};
	return { address, multisig, signer };
}

test('a row that passes rule 1 is checking until its alias set is read, then ok', () => {
	const { address, multisig, signer } = pod();
	const row = toUserMultisig(multisig, signer);

	expect(row).toMatchObject({
		refused: null,
		acting: { state: 'checking' },
	});
	expect(
		withActing(row, { kind: 'read', aliases: [address] }),
	).toMatchObject({
		refused: null,
		acting: { state: 'ok', unidentified: [] },
	});
});

test('a rule 1 refusal wins over anything the node says', () => {
	const { address, multisig, signer } = pod();
	const row = toUserMultisig(
		{ ...multisig, threshold: 2 },
		signer,
	);

	expect(
		withActing(row, { kind: 'read', aliases: [address] }),
	).toMatchObject({ refused: 'signers', acting: null });
});

test('a row whose shown set is not in the alias set is refused as not acting', () => {
	const { multisig, signer } = pod();
	const other = pod();
	const row = toUserMultisig(multisig, signer);

	expect(
		withActing(row, {
			kind: 'read',
			aliases: [other.address],
		}),
	).toMatchObject({ refused: 'notActing', acting: null });
});

test('an unread alias set leaves the row unchecked, not refused', () => {
	const { multisig, signer } = pod();
	const row = toUserMultisig(multisig, signer);

	expect(withActing(row, { kind: 'failed' })).toMatchObject(
		{
			refused: null,
			acting: { state: 'unchecked' },
		},
	);
	expect(withActing(row, undefined)).toMatchObject({
		refused: null,
		acting: { state: 'checking' },
	});
});
