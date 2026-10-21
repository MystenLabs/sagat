// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	Account,
	PublicProposal,
	SignerSetWithMembers,
} from '@mysten/sagat';

// How the connected key stands in a signer set, and how far the set's other
// members are, for the cards that show it.
export interface KeyMembership {
	isAccepted: boolean;
	isRejected: boolean;
	pendingMembers: number;
	rejectedMembers: number;
}

// An account the connected key signs for, with the key's place in the
// signer sets it is a member of that are valid on some network.
export interface AccountForPublicKey
	extends Account, KeyMembership {}

// A signer set the connected key is invited to.
export interface InvitationForPublicKey
	extends SignerSetWithMembers, KeyMembership {}

export interface ProposalCardInput extends PublicProposal {
	isPublic: boolean;
	proposers: string[];
}
