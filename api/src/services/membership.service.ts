// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Whether a key signs for an account, under a signer scope. Kept apart from
 * the flows in `multisig.service.ts` so that the signature helpers can check
 * it without a circular import.
 */

import { type PublicKey } from '@mysten/sui/cryptography';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db';
import { SchemaSignerSetMembers } from '../db/schema';
import {
	keyAnswer,
	resolveAccountSigners,
	type SignerScope,
} from './signers.service';

// Whether any of the keys signs for the account under the scope.
export const isAccountSigner = async (
	accountAddress: string,
	publicKeys: PublicKey[],
	{
		acceptedOnly,
		scope,
	}: {
		// Whether the key must have accepted the account.
		acceptedOnly: boolean;
		scope: SignerScope;
	},
): Promise<boolean> => {
	const keys = publicKeys.map((key) =>
		key.toSuiPublicKey(),
	);

	if (scope.kind === 'original') {
		const member =
			await db.query.SchemaSignerSetMembers.findFirst({
				where: and(
					eq(
						SchemaSignerSetMembers.signerSetAddress,
						accountAddress,
					),
					inArray(SchemaSignerSetMembers.publicKey, keys),
					acceptedOnly
						? eq(SchemaSignerSetMembers.isAccepted, true)
						: undefined,
				),
			});
		return !!member;
	}

	const signers = await resolveAccountSigners(
		accountAddress,
		scope,
	);
	if (!signers) return false;
	return keys.some((key) => {
		const answer = keyAnswer(signers, key);
		return acceptedOnly
			? answer === 'accepted'
			: answer !== null;
	});
};
