// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';

import { validatePublicKey } from '@/lib/sui-utils';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

/** What to call an account in copy: its name, or its short address. */
export function accountName(
	m: MultisigWithMembersForPublicKey,
) {
	return m.name || formatAddress(m.address);
}

/**
 * The address of the signer who created the account, which the create
 * wizard always puts first in the composition. Null when the key can't
 * be read.
 */
export function creatorAddress(
	m: MultisigWithMembersForPublicKey,
): string | null {
	const first = [...m.members].sort(
		(a, b) => a.order - b.order,
	)[0];
	if (!first) return null;
	try {
		return (
			validatePublicKey(first.publicKey).address ?? null
		);
	} catch {
		return null;
	}
}
