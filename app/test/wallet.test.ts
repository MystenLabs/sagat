// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	Ed25519Keypair,
	Ed25519PublicKey,
} from '@mysten/sui/keypairs/ed25519';
import { PasskeyPublicKey } from '@mysten/sui/keypairs/passkey';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';
import { toZkLoginPublicIdentifier } from '@mysten/sui/zklogin';
import { describe, expect, test } from 'vitest';

import { unsupportedAccountScheme } from '../src/lib/wallet';

describe('unsupportedAccountScheme', () => {
	test('refuses a zkLogin key that matches its address', () => {
		const key = toZkLoginPublicIdentifier(
			123n,
			'https://accounts.google.com',
			{ legacyAddress: false },
		);

		expect(
			unsupportedAccountScheme({
				address: key.toSuiAddress(),
				publicKey: key.toSuiBytes(),
			}),
		).toBe('ZkLogin');
	});

	// 5 is the zkLogin flag, but without a matching address it's just a byte.
	test('does not refuse a raw Ed25519 key that starts with 5', () => {
		const raw = new Uint8Array(32).fill(1);
		raw[0] = 5;

		expect(
			unsupportedAccountScheme({
				address: new Ed25519PublicKey(raw).toSuiAddress(),
				publicKey: raw,
			}),
		).toBeUndefined();
	});

	test('refuses a passkey account', () => {
		const key = new PasskeyPublicKey(
			Secp256r1Keypair.generate()
				.getPublicKey()
				.toRawBytes(),
		);

		expect(
			unsupportedAccountScheme({
				address: key.toSuiAddress(),
				publicKey: key.toSuiBytes(),
			}),
		).toBe('Passkey');
	});

	test('does not refuse a flagged Ed25519 key', () => {
		const key = Ed25519Keypair.generate().getPublicKey();

		expect(
			unsupportedAccountScheme({
				address: key.toSuiAddress(),
				publicKey: key.toSuiBytes(),
			}),
		).toBeUndefined();
	});
});
