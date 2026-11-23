// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type Account } from '@mysten/sagat/v1';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { expect, test } from 'vitest';

import {
	toUserMultisig,
	withActing,
	withListedChecks,
} from '../src/lib/user-multisig';

/** A signer set of fresh keys of weight 1, 1-of-2 by default, every key accepted. */
function signerSet(
	keys = [new Ed25519Keypair(), new Ed25519Keypair()],
	threshold = 1,
) {
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

test('a row and the new-proposal copy read the threshold of a set that is an alias, never of one that is not', () => {
	const { multisig } = pod();
	const original = signerSet(undefined, 2);
	const viewer = new Ed25519Keypair();
	const fake = signerSet([viewer, new Ed25519Keypair()], 1);
	const real = signerSet(
		[viewer, new Ed25519Keypair(), new Ed25519Keypair()],
		3,
	);
	const account: Account = {
		...multisig,
		address: original.set.address,
		originalSignerSet: original.set,
		signerSets: [
			{ kind: 'signer_set', ...fake.set },
			{ kind: 'signer_set', ...real.set },
		],
	};
	const signer = signerOf(viewer);
	const checking = toUserMultisig(account, signer);
	const listed = withActing(
		checking,
		{ kind: 'read', aliases: [real.set.address] },
		signer,
	);

	// Before rule 2, the original set's; after, the real set's.
	expect(checking.threshold).toBe(2);
	expect(listed.threshold).toBe(3);
	expect(withListedChecks(listed, checking).threshold).toBe(
		3,
	);
});

test('a row reads the pod’s own set when the viewer signs in it and in an added set', () => {
	const viewer = new Ed25519Keypair();
	const own = signerSet([viewer, new Ed25519Keypair()], 2);
	const added = signerSet(
		[viewer, new Ed25519Keypair(), new Ed25519Keypair()],
		3,
	);
	const { multisig } = pod();
	const account: Account = {
		...multisig,
		address: own.set.address,
		originalSignerSet: own.set,
		signerSets: [
			{ kind: 'signer_set', ...added.set },
			{ kind: 'signer_set', ...own.set },
		],
	};
	const signer = signerOf(viewer);

	expect(
		withActing(
			toUserMultisig(account, signer),
			{
				kind: 'read',
				aliases: [added.set.address, own.set.address],
			},
			signer,
		).threshold,
	).toBe(2);
});
