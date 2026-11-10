// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigWithMembers } from '@mysten/sagat';

// Extended type that adds frontend-specific fields for displaying multisig state
// for a specific public key
export interface MultisigWithMembersForPublicKey extends MultisigWithMembers {
	rejectedMembers: number;
	pendingMembers: number;
	isAccepted: boolean;
	isRejected: boolean;
}
