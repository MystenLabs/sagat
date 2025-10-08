import { type PublicKey } from '@mysten/sui/cryptography';

import { db } from '../db';
import {
	MultisigWithMembers,
	SchemaAddresses,
} from '../db/schema';
import { CommonError } from '../errors';
import { MultisigDataLoader } from '../loaders/multisig.loader';
import { parsePublicKey } from '../utils/pubKey';

// Takes a pub key, a signature, and a message, and validates it.
// Returns the Sui address if valid, or null if not.
export const validatePersonalMessage = async (
	publicKey: PublicKey,
	signature: string,
	message: string,
) => {
	const isValid = await publicKey.verifyPersonalMessage(
		new TextEncoder().encode(message),
		signature,
	);

	if (!isValid) throw new CommonError('InvalidSignature');
};

/**
 * Registers a single public key in the addresses table
 */
export async function registerPublicKey(
	publicKey: PublicKey,
): Promise<void> {
	await db
		.insert(SchemaAddresses)
		.values({
			publicKey: publicKey.toSuiPublicKey(),
			address: publicKey.toSuiAddress(),
		})
		.onConflictDoNothing();
}

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
 * Expands multisig addresses to full MultisigWithMembers objects
 * Takes an array of multisig addresses and returns complete multisig data with all members
 */
export async function expandMultisigsWithMembers(
	multisigAddresses: string[],
): Promise<MultisigWithMembers[]> {
	if (multisigAddresses.length === 0) return [];

	const multisigs = await MultisigDataLoader.loadMany(
		multisigAddresses,
	);

	return multisigs.filter(Boolean) as MultisigWithMembers[];
}
