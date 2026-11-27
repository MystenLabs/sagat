// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Account } from '@mysten/sagat/v1';
import { formatAddress } from '@mysten/sui/utils';

import { validatePublicKey } from '@/lib/sui-utils';

import { originalSignerSet } from './proposal-integrity';

/** What to call an account in copy: its name, or its short address. */
export function accountName(m: {
	name?: string | null;
	address: string;
}) {
	return m.name || formatAddress(m.address);
}

/**
 * Accounts from before the rotation migration carry their own address as
 * `createdBy`; the migration also stamped them with its own run time as
 * `createdAt`, so neither tells us who created them or when.
 */
export function isLegacyAccount(m: {
	address: string;
	createdBy: string;
}) {
	return m.createdBy === m.address;
}

/**
 * Who created the account, from the API's `createdBy`: their address, and
 * the name the account gave their key when they are one of the original
 * signers. Null for legacy accounts, where the API doesn't know.
 */
export function accountCreator(
	m: Pick<Account, 'address' | 'createdBy' | 'signerSets'>,
): { address: string; label: string | null } | null {
	if (isLegacyAccount(m)) return null;
	const address = m.createdBy;
	const member = originalSignerSet(m).members.find(
		(member) =>
			validatePublicKey(member.publicKey).address ===
			address,
	);
	return { address, label: member?.label ?? null };
}
