// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Registered public keys and the Sui addresses they derive (keys are
 * registered when they connect, are passed to `POST /addresses`, or are put
 * in a multisig), plus loading signer sets by address.
 */

import { type PublicKey } from '@mysten/sui/cryptography';
import { eq } from 'drizzle-orm';

import { db } from '../db';
import {
	SchemaAddresses,
	type Address,
	type SignerSetWithMembers,
} from '../db/schema';
import { ValidationError } from '../errors';
import { SignerSetDataLoader } from '../loaders/signer-set.loader';
import { parsePublicKey } from '../utils/pubKey';

/**
 * Registers multiple public keys in the addresses table
 */
export async function registerPublicKeys(
	publicKeys: PublicKey[],
): Promise<void> {
	if (publicKeys.length === 0) return;

	const addressData = publicKeys.map((pubKey) => ({
		publicKey: pubKey.toSuiPublicKey(),
		address: pubKey.toSuiAddress(),
	}));

	await db
		.insert(SchemaAddresses)
		.values(addressData)
		.onConflictDoNothing();
}

/**
 * Registers public keys from base64 strings
 */
export async function registerPublicKeyStrings(
	publicKeyStrings: string[],
): Promise<void> {
	if (publicKeyStrings.length === 0) return;

	const publicKeys = publicKeyStrings.map((keyStr) =>
		parsePublicKey(keyStr),
	);
	await registerPublicKeys(publicKeys);
}

/**
 * Registers the caller's keys and any extra keys they pass. Extra keys that
 * fail to parse are skipped.
 */
export async function registerCallerKeys({
	callerKeys,
	extraPublicKeys,
}: {
	callerKeys: PublicKey[];
	extraPublicKeys: string[];
}): Promise<void> {
	// Parse extra public keys using the existing utility
	const parsedExtraKeys = extraPublicKeys
		.map((keyStr) => {
			try {
				return parsePublicKey(keyStr);
			} catch (error) {
				// eslint-disable-next-line no-console
				console.warn(
					'Failed to parse public key:',
					keyStr,
					error,
				);
				return null;
			}
		})
		.filter((key) => key !== null);

	await registerPublicKeys([
		...callerKeys,
		...parsedExtraKeys,
	]);
}

// The registered public key of an address.
export async function getRegisteredAddress(
	address: string,
): Promise<Address> {
	const addr = await db.query.SchemaAddresses.findFirst({
		where: eq(SchemaAddresses.address, address),
	});

	if (!addr)
		throw new ValidationError(
			'Address is not registered in the system.',
		);

	return addr;
}

/**
 * Expands signer set addresses to full SignerSetWithMembers objects, with all
 * members. Unknown addresses are left out.
 */
export async function expandSignerSetsWithMembers(
	signerSetAddresses: string[],
): Promise<SignerSetWithMembers[]> {
	if (signerSetAddresses.length === 0) return [];

	const signerSets = await SignerSetDataLoader.loadMany(
		signerSetAddresses,
	);

	return signerSets.filter(
		Boolean,
	) as SignerSetWithMembers[];
}
