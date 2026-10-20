// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, test } from 'vitest';

import { accountCreator } from '../src/components/invitations/account-name';

const signer = (label: string | null) => {
	const keypair = new Ed25519Keypair();
	return {
		address: keypair.toSuiAddress(),
		member: {
			publicKey: keypair.getPublicKey().toSuiPublicKey(),
			label,
		},
	};
};

describe('account creator', () => {
	const alice = signer('Alice');
	const bob = signer(null);
	const account = `0x${'ab'.repeat(32)}`;

	test('a member who created the account shows by name, wherever they sit', () => {
		expect(
			accountCreator({
				address: account,
				draftedBy: alice.address,
				members: [bob.member, alice.member],
			}),
		).toEqual({ address: alice.address, label: 'Alice' });
	});

	test('a creator who is not a member shows by address alone', () => {
		const outsider = signer(null);
		expect(
			accountCreator({
				address: account,
				draftedBy: outsider.address,
				members: [bob.member, alice.member],
			}),
		).toEqual({ address: outsider.address, label: null });
	});

	test('an unknown creator is null, not the first member', () => {
		expect(
			accountCreator({
				address: account,
				draftedBy: null,
				members: [alice.member],
			}),
		).toBeNull();
		// Accounts from before the rotation migration carry their own address.
		expect(
			accountCreator({
				address: account,
				draftedBy: account,
				members: [alice.member],
			}),
		).toBeNull();
	});
});
