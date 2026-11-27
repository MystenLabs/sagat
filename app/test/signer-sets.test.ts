// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { expect, test } from 'vitest';

import {
	differentSignersLine,
	otherSignerSetRows,
	signerSetCards,
} from '../src/lib/signer-sets';
import { type IdentifiedSignerSet } from '../src/lib/types';
import { signerSet } from './signer-set';

/** A pod of the viewer's list made from `set`. */
function listed(
	set: IdentifiedSignerSet,
	name: string | null,
	refused: 'signers' | null = null,
) {
	return {
		address: set.address,
		name,
		signerSets: [set],
		refused,
	};
}

const viewer = new Ed25519Keypair();
const original = signerSet([viewer, new Ed25519Keypair()]);

test('puts the set the viewer signs in first, the pod’s own before an added one, the rest in the given order, and links the pod’s own set to no pod', () => {
	const other = signerSet([new Ed25519Keypair()]);
	const third = signerSet([new Ed25519Keypair()]);
	const viewers = signerSet([
		viewer,
		new Ed25519Keypair(),
		new Ed25519Keypair(),
	]);

	const cards = signerSetCards({
		acting: [other, viewers, third],
		fresh: [],
		account: original.address,
		pods: [],
		signerAddress: viewer.toSuiAddress(),
	});

	expect(cards.map((card) => card.address)).toEqual([
		viewers.address,
		other.address,
		third.address,
	]);

	const own = signerSetCards({
		acting: [viewers, original],
		fresh: [],
		account: original.address,
		pods: [listed(original, 'Treasury')],
		signerAddress: viewer.toSuiAddress(),
	});

	expect(
		own.map(({ address, pod }) => ({ address, pod })),
	).toEqual([
		{ address: original.address, pod: null },
		{ address: viewers.address, pod: null },
	]);
});

test('a fresh read of a set that makes up the same address stands in for it', () => {
	const fresh = {
		...original,
		members: original.members.map((member) => ({
			...member,
			label: 'Renamed',
		})),
	};

	const [card] = signerSetCards({
		acting: [original],
		fresh: [fresh],
		account: original.address,
		pods: [],
		signerAddress: viewer.toSuiAddress(),
	});

	expect(card.set).toBe(fresh);
});

test('an alias is created in Pods only when it is the address of a pod whose signers make it up', () => {
	const unknown = signerSet([new Ed25519Keypair()]).address;
	const recovery = signerSet(
		[
			new Ed25519Keypair(),
			new Ed25519Keypair(),
			new Ed25519Keypair(),
		],
		2,
	);
	const refused = signerSet([new Ed25519Keypair()]);

	expect(
		otherSignerSetRows(
			[unknown, recovery.address, refused.address],
			[
				listed(recovery, 'Treasury Recovery'),
				listed(refused, 'Refused', 'signers'),
			],
		),
	).toEqual([
		{ address: unknown, pod: null },
		{
			address: recovery.address,
			pod: {
				address: recovery.address,
				name: 'Treasury Recovery',
				signers: '3 signers',
				threshold: 'Threshold 2 of 3',
			},
		},
		{ address: refused.address, pod: null },
	]);
});

test('the signers differ notice names the other networks as a list, and none shows nothing', () => {
	expect(differentSignersLine(['testnet', 'devnet'])).toBe(
		'This pod’s signers are different on Testnet and Devnet.',
	);
	expect(differentSignersLine([])).toBeNull();
});
