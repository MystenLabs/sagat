// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	SIGNATURE_SCHEME_TO_FLAG,
	SIGNATURE_SCHEME_TO_SIZE,
	type PublicKey,
} from '@mysten/sui/cryptography';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1PublicKey } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1PublicKey } from '@mysten/sui/keypairs/secp256r1';
import { fromBase64 } from '@mysten/sui/utils';

// Format the expiry time for the signature message
export function getExpiryTime(): string {
	const expiry = new Date();
	expiry.setMinutes(expiry.getMinutes() + 30); // 30 minutes from now
	return expiry.toISOString();
}

// Create the auth message that needs to be signed
export function createAuthMessage(expiry: string): string {
	return `Verifying address ownership until: ${expiry}`;
}

export const extractPublicKeyFromBase64 = (
	publicKey: string,
): PublicKey => {
	const bytes = fromBase64(publicKey);

	// if bytes length === 33, we only accept ed25519 ones.
	if (
		bytes.length ===
		SIGNATURE_SCHEME_TO_SIZE.ED25519 + 1
	) {
		const flag = bytes[0];
		const data = bytes.slice(1);

		if (flag !== SIGNATURE_SCHEME_TO_FLAG.ED25519)
			throw new Error(
				'Public keys must have a sui flag. You can export them using `toSuiPublicKey()` instead of `toBase64()`.',
			);

		return new Ed25519PublicKey(data);
	}

	// For length === 34, we know it's either secp256k1, or secp256r1
	if (
		bytes.length ===
		SIGNATURE_SCHEME_TO_SIZE.Secp256k1 + 1
	) {
		const flag = bytes[0];
		const data = bytes.slice(1);

		if (flag === SIGNATURE_SCHEME_TO_FLAG.Secp256k1)
			return new Secp256k1PublicKey(data);
		if (flag === SIGNATURE_SCHEME_TO_FLAG.Secp256r1)
			return new Secp256r1PublicKey(data);
	}

	throw new Error(
		'Only ED25519, Secp256k1, and Secp256r1 are supported. Also, public keys must have a sui flag. You can export them using `toSuiPublicKey()` instead of `toBase64()`.',
	);
};
