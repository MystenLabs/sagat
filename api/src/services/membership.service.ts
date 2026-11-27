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
import { ApiAuthError } from '../errors';
import {
	resolveAccountSigners,
	signsFor,
	type AccountSigners,
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
	return !!signers && signsFor(signers, keys, acceptedOnly);
};

// The acting scope's refusal of keys that are no accepted signer: not accepted, or no signer at all.
export const notAcceptedSignerError = (
	signers: AccountSigners | undefined,
	publicKeys: string[],
) =>
	new ApiAuthError(
		signers && signsFor(signers, publicKeys, false)
			? 'AccountNotAccepted'
			: 'NotAnAccountSigner',
	);
