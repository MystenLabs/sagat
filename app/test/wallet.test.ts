// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { toZkLoginPublicIdentifier } from '@mysten/sui/zklogin';
import { describe, expect, test } from 'vitest';

import { isZkLoginAccount } from '../src/lib/wallet';

describe('isZkLoginAccount', () => {
	test('refuses a flagged key that matches its address', () => {
		const key = toZkLoginPublicIdentifier(
			123n,
			'https://accounts.google.com',
			{ legacyAddress: false },
		);

		expect(
			isZkLoginAccount({
				address: key.toSuiAddress(),
				publicKey: key.toSuiBytes(),
			}),
		).toBe(true);
	});

	// 5 is the zkLogin flag, but without a matching address it's just a byte.
	test('does not refuse a raw Ed25519 key that starts with 5', () => {
		const raw = new Uint8Array(32).fill(1);
		raw[0] = 5;

		expect(
			isZkLoginAccount({
				address: new Ed25519PublicKey(raw).toSuiAddress(),
				publicKey: raw,
			}),
		).toBe(false);
	});
});
