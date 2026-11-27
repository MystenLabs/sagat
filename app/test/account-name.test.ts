// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, test } from 'vitest';

import { accountCreator } from '../src/lib/account-name';

const signer = (label: string | null) => {
	const keypair = new Ed25519Keypair();
	return {
		address: keypair.toSuiAddress(),
		member: {
			publicKey: keypair.getPublicKey().toSuiPublicKey(),
			weight: 1,
			order: 0,
			answer: 'accepted' as const,
			label,
		},
	};
};

describe('account creator', () => {
	const alice = signer('Alice');
	const bob = signer(null);
	const account = `0x${'ab'.repeat(32)}`;
	const original = (members: (typeof alice.member)[]) => [
		{
			kind: 'signer_set' as const,
			address: account,
			threshold: 1,
			members,
			acting: true,
		},
	];

	test('a member who created the account shows by name, wherever they sit', () => {
		expect(
			accountCreator({
				address: account,
				createdBy: alice.address,
				signerSets: original([bob.member, alice.member]),
			}),
		).toEqual({ address: alice.address, label: 'Alice' });
	});

	test('a creator who is not a member shows by address alone', () => {
		const outsider = signer(null);
		expect(
			accountCreator({
				address: account,
				createdBy: outsider.address,
				signerSets: original([bob.member, alice.member]),
			}),
		).toEqual({ address: outsider.address, label: null });
	});

	test('an unknown creator is null, not the first member', () => {
		// Accounts from before the rotation migration carry their own address.
		expect(
			accountCreator({
				address: account,
				createdBy: account,
				signerSets: original([alice.member]),
			}),
		).toBeNull();
	});
});
