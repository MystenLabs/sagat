// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';

import { validatePublicKey } from '@/lib/sui-utils';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

/** What to call an account in copy: its name, or its short address. */
export function accountName(m: {
	name?: string | null;
	address: string;
}) {
	return m.name || formatAddress(m.address);
}

/**
 * The signer who created the account, which the create wizard always
 * puts first in the composition: their address, and the name the
 * account gave their key, if any. Null when the key can't be read.
 *
 * A stand-in: the API's `draftedBy` is the real creator (who may not be
 * first, or a member at all), so switch to it once the API exposes it.
 */
export function accountCreator(
	m: MultisigWithMembersForPublicKey,
): { address: string; label: string | null } | null {
	const first = [...m.members].sort(
		(a, b) => a.order - b.order,
	)[0];
	if (!first) return null;
	const { address } = validatePublicKey(first.publicKey);
	return address ? { address, label: first.label } : null;
}
