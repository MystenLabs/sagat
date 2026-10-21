// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { parseSerializedSignature } from '@mysten/sui/cryptography';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { publicKeyFromRawBytes } from '@mysten/sui/verify';

// The address that produced a serialized signature: the multisig address
// for a multisig, else the key's own address. Null when it cannot be
// derived.
const addressOfSignature = (
	signature: string,
): string | null => {
	try {
		const parsed = parseSerializedSignature(signature);
		if (parsed.signatureScheme === 'MultiSig')
			return new MultiSigPublicKey(
				parsed.multisig.multisig_pk,
			).toSuiAddress();
		return publicKeyFromRawBytes(
			parsed.signatureScheme,
			parsed.publicKey,
		).toSuiAddress();
	} catch {
		return null;
	}
};

/**
 * The address that signed an executed transaction for its sender: a signer
 * set of the account, possibly one Sagat does not know, or a single key
 * alias. A sponsored transaction also carries the gas owner's signature,
 * which is left out.
 */
export const senderSignerAddress = (
	signatures: string[],
	{
		sender,
		gasOwner,
	}: { sender: string; gasOwner: string },
): string | null => {
	const addresses = signatures
		.map(addressOfSignature)
		.filter((a): a is string => a !== null);
	const forSender =
		gasOwner === sender
			? addresses
			: addresses.filter((a) => a !== gasOwner);
	return forSender[0] ?? null;
};
