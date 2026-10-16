// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';

import { type MultisigWithMembersForPublicKey } from '@/lib/types';

/** What to call an account in copy: its name, or its short address. */
export function accountName(
	m: MultisigWithMembersForPublicKey,
) {
	return m.name || formatAddress(m.address);
}
