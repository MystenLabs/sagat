// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';

import { validatePublicKey } from '@/lib/sui-utils';

/** What to call an account in copy: its name, or its short address. */
export function accountName(m: {
	name?: string | null;
	address: string;
}) {
	return m.name || formatAddress(m.address);
}

/**
 * Who created the account, from the API's `draftedBy`: their address, and
 * the name the account gave their key when they are a member. Null when
 * the API doesn't know, which includes accounts from before the rotation
 * migration, where `draftedBy` is the account's own address.
 */
export function accountCreator(m: {
	address: string;
	draftedBy: string | null;
	members: { publicKey: string; label: string | null }[];
}): { address: string; label: string | null } | null {
	const address = m.draftedBy;
	if (!address || address === m.address) return null;
	const member = m.members.find(
		(member) =>
			validatePublicKey(member.publicKey).address ===
			address,
	);
	return { address, label: member?.label ?? null };
}
