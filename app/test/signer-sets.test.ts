// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type AccountSignerSet } from '@mysten/sagat/v1';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { expect, test } from 'vitest';

import {
	differentSignersLine,
	otherSignerSetRows,
	signerSetCards,
} from '../src/lib/signer-sets';

/** A signer set of `keys` with weight 1 each, every key accepted. */
function signerSet(
	keys: Ed25519Keypair[],
	threshold = 1,
): AccountSignerSet {
	return {
		address: MultiSigPublicKey.fromPublicKeys({
			threshold,
			publicKeys: keys.map((key) => ({
				publicKey: key.getPublicKey(),
				weight: 1,
			})),
		}).toSuiAddress(),
		threshold,
		members: keys.map((key, order) => ({
			publicKey: key.getPublicKey().toSuiPublicKey(),
			weight: 1,
			order,
			answer: 'accepted' as const,
			label: null,
		})),
	};
}

/** A pod of the viewer's list made from `set`. */
function listed(
	set: AccountSignerSet,
	name: string | null,
	refused: 'signers' | null = null,
) {
	return {
		address: set.address,
		name,
		originalSignerSet: set,
		refused,
	};
}

const viewer = new Ed25519Keypair();
const original = signerSet([viewer, new Ed25519Keypair()]);

test('puts the set the viewer signs in first, the rest in the given order', () => {
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
});

test('puts the pod’s own set first when the viewer signs in it and in an added set', () => {
	const added = signerSet(
		[viewer, new Ed25519Keypair()],
		2,
	);

	const cards = signerSetCards({
		acting: [added, original],
		fresh: [],
		account: original.address,
		pods: [],
		signerAddress: viewer.toSuiAddress(),
	});

	expect(cards.map((card) => card.address)).toEqual([
		original.address,
		added.address,
	]);
});

test('names a set after the viewer’s pod at its address only when that pod’s signers make it up', () => {
	const recovery = signerSet([viewer]);
	const stranger = signerSet([new Ed25519Keypair()]);

	const cards = signerSetCards({
		acting: [original, recovery, stranger],
		fresh: [],
		account: original.address,
		pods: [
			listed(original, 'Treasury'),
			listed(recovery, 'Recovery'),
			listed(stranger, 'Refused', 'signers'),
		],
		signerAddress: viewer.toSuiAddress(),
	});

	expect(
		cards.map(({ isOriginal, pod }) => ({
			isOriginal,
			pod,
		})),
	).toEqual([
		{ isOriginal: true, pod: null },
		{
			isOriginal: false,
			pod: { address: recovery.address, name: 'Recovery' },
		},
		{ isOriginal: false, pod: null },
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
