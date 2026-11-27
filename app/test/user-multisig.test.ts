// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type Account } from '@mysten/sagat/v1';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { expect, test } from 'vitest';

import {
	noLongerSignerOf,
	rowsAnswered,
	toUserMultisig,
	withActing,
	withListedChecks,
} from '../src/lib/user-multisig';
import { signerSet } from './signer-set';

const signerOf = (key: Ed25519Keypair) => ({
	publicKey: key.getPublicKey().toSuiPublicKey(),
	address: key.toSuiAddress(),
});

function pod() {
	const keys = [new Ed25519Keypair(), new Ed25519Keypair()];
	const set = signerSet(keys);
	const address = set.address;
	const multisig: Account = {
		address,
		name: null,
		createdBy: keys[0].toSuiAddress(),
		createdAt: '2026-11-20T10:00:00.000Z',
		signerSets: [set],
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
			signerSets: multisig.signerSets.map((set) => ({
				...set,
				threshold: 2,
			})),
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

test('a key only in a shown set that is no alias is refused as not acting, carrying the node’s aliases only when no shown set is one', () => {
	const { address, multisig } = pod();
	const other = pod();
	const strangerKey = new Ed25519Keypair();
	const stranger = signerSet([
		strangerKey,
		new Ed25519Keypair(),
	]);
	const signer = signerOf(strangerKey);
	const row = toUserMultisig(
		{
			...multisig,
			signerSets: [...multisig.signerSets, stranger],
		},
		signer,
	);

	expect(row.refused).toBeNull();
	expect(
		withActing(
			row,
			{ kind: 'read', aliases: [other.address] },
			signer,
		),
	).toMatchObject({
		refused: 'notActing',
		unidentified: [other.address],
	});
	expect(
		withActing(
			row,
			{ kind: 'read', aliases: [address, other.address] },
			signer,
		),
	).toMatchObject({
		refused: 'notActing',
		acting: null,
		unidentified: [],
	});
});

test('a row and the new-proposal copy read the threshold of a set that is an alias, never of one that is not, the pod’s own set first', () => {
	const { multisig } = pod();
	const viewer = new Ed25519Keypair();
	const original = signerSet(
		[viewer, new Ed25519Keypair()],
		2,
	);
	const fake = signerSet([viewer, new Ed25519Keypair()], 1);
	const real = signerSet(
		[viewer, new Ed25519Keypair(), new Ed25519Keypair()],
		3,
	);
	const account: Account = {
		...multisig,
		address: original.address,
		signerSets: [original, fake, real],
	};
	const signer = signerOf(viewer);
	const checking = toUserMultisig(account, signer);
	const listed = withActing(
		checking,
		{ kind: 'read', aliases: [real.address] },
		signer,
	);

	// Before rule 2, the original set's; after, the real set's.
	expect(checking.threshold).toBe(2);
	expect(listed.threshold).toBe(3);
	expect(withListedChecks(listed, checking).threshold).toBe(
		3,
	);
	// The viewer signs in an added set and the pod's own: the own set's.
	expect(
		withActing(
			checking,
			{
				kind: 'read',
				aliases: [real.address, original.address],
			},
			signer,
		).threshold,
	).toBe(2);
});

test('an account read for another address leaves the listed row as it is', () => {
	const { multisig, signer } = pod();
	const other = pod();
	const listed = toUserMultisig(multisig, signer);

	expect(
		withListedChecks(
			listed,
			toUserMultisig(other.multisig, other.signer),
		),
	).toBe(listed);
});

test('a key only in a set the API reports as not acting gets no row and the no-longer-a-signer state, while the session’s other key keeps the pod', () => {
	const [kept, removed, added] = [
		new Ed25519Keypair(),
		new Ed25519Keypair(),
		new Ed25519Keypair(),
	];
	const original = {
		...signerSet([kept, removed]),
		acting: false,
	};
	const current = {
		...signerSet([kept, added]),
		original: false,
	};
	const list = {
		accounts: [
			{
				...pod().multisig,
				address: original.address,
				signerSets: [original, current],
			},
		],
		removed: [],
	};

	expect(
		rowsAnswered(list.accounts, signerOf(kept), 'accepted'),
	).toHaveLength(1);
	expect(
		rowsAnswered(
			list.accounts,
			signerOf(removed),
			'accepted',
		),
	).toEqual([]);
	expect(
		noLongerSignerOf(list, signerOf(removed).publicKey),
	).toEqual([original.address]);
	expect(
		noLongerSignerOf(list, signerOf(kept).publicKey),
	).toEqual([]);
});
