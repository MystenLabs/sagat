// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Who belongs to a signer set, by its address, for the flows that act on
 * a composition rather than an account (accepting, reading a multisig).
 */

import { type PublicKey } from '@mysten/sui/cryptography';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db';
import { SchemaSignerSetMembers } from '../db/schema';

// Returns true if the public key is a member of the signer set and has accepted the invitation.
export const isSignerSetMember = async (
	signerSetAddress: string,
	publicKey: PublicKey,
	checkAcceptance: boolean = true,
) => {
	const whereConditions = [
		eq(
			SchemaSignerSetMembers.signerSetAddress,
			signerSetAddress,
		),
		eq(
			SchemaSignerSetMembers.publicKey,
			publicKey.toSuiPublicKey(),
		),
	];

	if (checkAcceptance) {
		whereConditions.push(
			eq(SchemaSignerSetMembers.isAccepted, true),
		);
	}

	const member =
		await db.query.SchemaSignerSetMembers.findFirst({
			where: and(...whereConditions),
		});
	return !!member;
};

// A convenient checker to see if ANY of the JWT addresses from the header
// have acess to the requested signer set.
export const jwtHasSignerSetMemberAccess = async (
	signerSetAddress: string,
	publicKeys: PublicKey[],
	checkAcceptance: boolean = true,
) => {
	const whereConditions = [
		eq(
			SchemaSignerSetMembers.signerSetAddress,
			signerSetAddress,
		),
		inArray(
			SchemaSignerSetMembers.publicKey,
			publicKeys.map((key) => key.toSuiPublicKey()),
		),
	];

	if (checkAcceptance) {
		whereConditions.push(
			eq(SchemaSignerSetMembers.isAccepted, true),
		);
	}

	const member =
		await db.query.SchemaSignerSetMembers.findFirst({
			where: and(...whereConditions),
		});

	return !!member;
};
