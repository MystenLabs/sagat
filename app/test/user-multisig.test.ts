// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type Account } from '@mysten/sagat/v1';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { expect, test } from 'vitest';

import {
	toUserMultisig,
	viewerSignerSet,
	withActing,
} from '../src/lib/user-multisig';

/** A 1-of-2 signer set of fresh keys, every key accepted. */
function signerSet(
	keys = [new Ed25519Keypair(), new Ed25519Keypair()],
) {
	const threshold = 1;
	const address = MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: keys.map((key) => ({
			publicKey: key.getPublicKey(),
			weight: 1,
		})),
	}).toSuiAddress();
	return {
		keys,
		set: {
			address,
			threshold,
			members: keys.map((key, order) => ({
				publicKey: key.getPublicKey().toSuiPublicKey(),
				weight: 1,
				order,
				answer: 'accepted' as const,
				label: null,
			})),
		},
	};
}

const signerOf = (key: Ed25519Keypair) => ({
	publicKey: key.getPublicKey().toSuiPublicKey(),
	address: key.toSuiAddress(),
});

function pod() {
	const { keys, set } = signerSet();
	const address = set.address;
	const multisig: Account = {
		address,
		name: null,
		createdBy: keys[0].toSuiAddress(),
		createdAt: '2026-11-20T10:00:00.000Z',
		originalSignerSet: set,
		signerSets: [{ kind: 'signer_set', ...set }],
		otherSignerSets: [],
		signerSetsStale: false,
	};
	return { address, multisig, signer: signerOf(keys[0]) };
}

test('a row that passes rule 1 is checking until its alias set is read, then ok', () => {
	const { address, multisig, signer } = pod();
	const row = toUserMultisig(multisig, signer);

	expect(row).toMatchObject({
		refused: null,
		acting: { state: 'checking' },
	});
	expect(
		withActing(
			row,
			{ kind: 'read', aliases: [address] },
			signer,
		),
	).toMatchObject({
		refused: null,
		acting: { state: 'ok', unidentified: [] },
	});
});

test('a rule 1 refusal wins over anything the node says', () => {
	const { address, multisig, signer } = pod();
	const row = toUserMultisig(
		{
			...multisig,
			originalSignerSet: {
				...multisig.originalSignerSet,
				threshold: 2,
			},
		},
		signer,
	);

	expect(
		withActing(
			row,
			{ kind: 'read', aliases: [address] },
			signer,
		),
	).toMatchObject({ refused: 'signers', acting: null });
});

test('a row whose shown set is not in the alias set is refused as not acting', () => {
	const { multisig, signer } = pod();
	const other = pod();
	const row = toUserMultisig(multisig, signer);

	expect(
		withActing(
			row,
			{
				kind: 'read',
				aliases: [other.address],
			},
			signer,
		),
	).toMatchObject({ refused: 'notActing', acting: null });
});

test('an unread alias set leaves the row unchecked, not refused', () => {
	const { multisig, signer } = pod();
	const row = toUserMultisig(multisig, signer);

	expect(
		withActing(row, { kind: 'failed' }, signer),
	).toMatchObject({
		refused: null,
		acting: { state: 'unchecked' },
	});
	expect(withActing(row, undefined, signer)).toMatchObject({
		refused: null,
		acting: { state: 'checking' },
	});
});

test('a key only in a shown set that is no alias is refused as not acting', () => {
	const { address, multisig } = pod();
	const stranger = signerSet();
	const row = toUserMultisig(
		{
			...multisig,
			signerSets: [
				...multisig.signerSets,
				{ kind: 'signer_set', ...stranger.set },
			],
		},
		signerOf(stranger.keys[0]),
	);

	expect(row.refused).toBeNull();
	expect(
		withActing(
			row,
			{ kind: 'read', aliases: [address] },
			signerOf(stranger.keys[0]),
		),
	).toMatchObject({ refused: 'notActing', acting: null });
});

test('the key’s set is the first shown set that holds it, else the original set', () => {
	const { multisig, signer } = pod();
	const recovery = signerSet([
		new Ed25519Keypair(),
		new Ed25519Keypair(),
	]);
	const sets = [
		{ kind: 'signer_set' as const, ...recovery.set },
		...multisig.signerSets,
	];

	expect(
		viewerSignerSet(
			sets,
			multisig.originalSignerSet,
			signer.address,
		),
	).toBe(sets[1]);
	expect(
		viewerSignerSet(
			sets.slice(0, 1),
			multisig.originalSignerSet,
			signer.address,
		),
	).toBe(multisig.originalSignerSet);
});

test('a row refused as not acting carries the node’s aliases only when no shown set is one', () => {
	const { address, multisig } = pod();
	const other = pod();
	const stranger = signerSet();
	const row = toUserMultisig(
		{
			...multisig,
			signerSets: [
				...multisig.signerSets,
				{ kind: 'signer_set', ...stranger.set },
			],
		},
		signerOf(stranger.keys[0]),
	);

	expect(
		withActing(
			row,
			{ kind: 'read', aliases: [other.address] },
			signerOf(stranger.keys[0]),
		),
	).toMatchObject({
		refused: 'notActing',
		unidentified: [other.address],
	});
	expect(
		withActing(
			row,
			{ kind: 'read', aliases: [address, other.address] },
			signerOf(stranger.keys[0]),
		),
	).toMatchObject({
		refused: 'notActing',
		unidentified: [],
	});
});
