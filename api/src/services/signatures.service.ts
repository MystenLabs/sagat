// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Authorization for the requests that carry a signature instead of a JWT:
 * the signer is recovered from the signature, then checked against the
 * message (or transaction) it must have signed. Signed personal messages go
 * through `verifySignedMessage` or `verifyMemberSignedMessage` only.
 */

import { type PublicKey } from '@mysten/sui/cryptography';

import { CommonError, ValidationError } from '../errors';
import { getPublicKeyFromSerializedSignature } from '../utils/pubKey';
import { isSignerSetMember } from './membership.service';

// Takes a pub key, a signature, and a message, and validates it.
// Throws `InvalidSignature` if the signature does not sign the message.
const validatePersonalMessage = async (
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

// Recovers the signer of a personal message and checks the signature.
export const verifySignedMessage = async (
	signature: string,
	message: string,
): Promise<PublicKey> => {
	const signer =
		getPublicKeyFromSerializedSignature(signature);
	await validatePersonalMessage(signer, signature, message);
	return signer;
};

/**
 * Recovers the signer of a personal message, checks that it is a member of
 * the signer set (or passes `isMember`), then checks the signature.
 * Membership is checked first, so a non-member gets `notMemberError`
 * whatever it signed.
 */
export const verifyMemberSignedMessage = async ({
	signature,
	message,
	notMemberError,
	...membership
}: {
	signature: string;
	message: string;
	notMemberError: () => Error;
} & (
	| {
			signerSetAddress: string;
			// Whether the member must have accepted the invitation.
			acceptedOnly: boolean;
	  }
	| {
			// Decides membership instead, e.g. across an account's valid
			// signer sets.
			isMember: (signer: PublicKey) => Promise<boolean>;
	  }
)): Promise<PublicKey> => {
	const signer =
		getPublicKeyFromSerializedSignature(signature);

	const isMember =
		'isMember' in membership
			? await membership.isMember(signer)
			: await isSignerSetMember(
					membership.signerSetAddress,
					signer,
					membership.acceptedOnly,
				);
	if (!isMember) throw notMemberError();

	await validatePersonalMessage(signer, signature, message);
	return signer;
};

// Checks that `signature` signs the transaction `bytes` as `signer`.
export const verifyTransactionSignature = async (
	signer: PublicKey,
	bytes: Uint8Array,
	signature: string,
) => {
	if (!(await signer.verifyTransaction(bytes, signature)))
		throw new ValidationError(
			'Invalid Sui signature for the proposed transaction.',
		);
};
