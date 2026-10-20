// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Serializers for the legacy (unversioned) routes.
 *
 * The database uses the account / signer set vocabulary, but the legacy routes
 * keep returning the JSON shapes defined by the frozen SDK types
 * (`sdk/src/types.ts`). These functions map rows to those shapes explicitly,
 * keeping the original field names and order, and leaving out new columns.
 */

import type {
	AccountProposer,
	AccountSignerSet,
	Proposal,
	ProposalSignature,
	ProposalWithSignatures,
	SignerSet,
	SignerSetMember,
	SignerSetWithMembers,
} from '../db/schema';
import { type KeyLabels } from '../loaders/account-keys.loader';
import type { PaginatedResponse } from '../utils/pagination';

export type LegacyMultisig = {
	address: string;
	isVerified: boolean;
	threshold: number;
	name: string | null;
	// Added after the freeze (additive, nullable): who created the multisig
	// and when, from the account's `account_signer_sets` row for its
	// original composition. Null when the account has no such row.
	draftedBy: string | null;
	createdAt: Date | null;
};

/** Who drafted a signer set for an account, and when. */
export type SignerSetOrigin = Pick<
	AccountSignerSet,
	'draftedBy' | 'createdAt'
>;

export type LegacyMultisigMember = {
	multisigAddress: string;
	publicKey: string;
	weight: number;
	isAccepted: boolean;
	isRejected: boolean;
	order: number;
	// Added after the freeze (additive, nullable): what the account calls
	// this key, from `account_keys`. Null when the key was never labelled.
	label: string | null;
};

export type LegacyMultisigProposer = Omit<
	AccountProposer,
	'accountAddress'
>;

export type LegacyMultisigWithMembers = LegacyMultisig & {
	members: LegacyMultisigMember[];
	proposers: LegacyMultisigProposer[];
	totalMembers: number;
	totalWeight: number;
};

export type LegacyProposal = {
	id: number;
	multisigAddress: string;
	digest: string;
	status: number;
	transactionBytes: string;
	proposerAddress: string;
	description: string | null;
	network: string;
	createdAt: Date;
};

export type LegacyProposalWithSignatures =
	LegacyProposal & {
		signatures: ProposalSignature[];
	};

export const toLegacyMultisig = (
	signerSet: SignerSet,
	// Who created the multisig and when. Required so that every call site
	// decides where it comes from.
	origin: SignerSetOrigin | null,
): LegacyMultisig => ({
	address: signerSet.address,
	isVerified: signerSet.isVerified,
	threshold: signerSet.threshold,
	name: signerSet.name,
	draftedBy: origin?.draftedBy ?? null,
	createdAt: origin?.createdAt ?? null,
});

export const toLegacyMultisigMember = (
	member: SignerSetMember,
	label: string | null,
): LegacyMultisigMember => ({
	multisigAddress: member.signerSetAddress,
	publicKey: member.publicKey,
	weight: member.weight,
	isAccepted: member.isAccepted,
	isRejected: member.isRejected,
	order: member.order,
	label,
});

// A legacy multisig is a signer set plus the proposers of the account with
// the same address.
export const toLegacyMultisigWithMembers = (
	signerSet: SignerSetWithMembers,
	proposers: LegacyMultisigProposer[],
	// Labels of the account with the same address, by public key. Required
	// so that every call site decides where they come from.
	labels: KeyLabels,
	origin: SignerSetOrigin | null,
): LegacyMultisigWithMembers => ({
	...toLegacyMultisig(signerSet, origin),
	members: signerSet.members.map((member) =>
		toLegacyMultisigMember(
			member,
			labels.get(member.publicKey) ?? null,
		),
	),
	proposers: proposers.map((proposer) => ({
		address: proposer.address,
		addedBy: proposer.addedBy,
		addedAt: proposer.addedAt,
	})),
	totalMembers: signerSet.totalMembers,
	totalWeight: signerSet.totalWeight,
});

export const toLegacyProposal = (
	proposal: Proposal,
): LegacyProposal => ({
	id: proposal.id,
	multisigAddress: proposal.accountAddress,
	digest: proposal.digest,
	status: proposal.status,
	transactionBytes: proposal.transactionBytes,
	proposerAddress: proposal.proposerAddress,
	description: proposal.description,
	network: proposal.network,
	createdAt: proposal.createdAt,
});

export const toLegacyProposalWithSignatures = (
	proposal: ProposalWithSignatures,
): LegacyProposalWithSignatures => ({
	...toLegacyProposal(proposal),
	signatures: proposal.signatures,
});

export const toLegacyPaginatedProposals = (
	page: PaginatedResponse<ProposalWithSignatures>,
): PaginatedResponse<LegacyProposalWithSignatures> => ({
	...page,
	data: page.data.map(toLegacyProposalWithSignatures),
});
