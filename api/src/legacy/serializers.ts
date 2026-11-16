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

import {
	type AccountEvent,
	type PublicProposal,
} from '@mysten/sagat';

import type {
	AccountProposer,
	Proposal,
	ProposalSignature,
	ProposalWithSignatures,
	SignerSet,
	SignerSetMember,
	SignerSetOrigin,
	SignerSetWithMembers,
} from '../db/schema';
import type {
	AccountEventRecord,
	ProposalEvents,
} from '../services/account-events.service';
import type { MultisigAccount } from '../services/multisig.service';
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

// Added after the freeze (additive): an audit log event as stored, proof
// included.
export type LegacyAccountEvent = {
	id: number;
	action: string;
	actor: string;
	subject: string | null;
	proof: unknown;
	createdAt: Date;
};

const toLegacyAccountEvent = (
	event: AccountEventRecord | null | undefined,
): LegacyAccountEvent | null =>
	event
		? {
				id: event.id,
				action: event.action,
				actor: event.actor,
				subject: event.subject,
				proof: event.proof,
				createdAt: event.createdAt,
			}
		: null;

// Typed as JSON sends it, like the SDK.
const toPublicAccountEvent = (
	event: AccountEventRecord | null,
): AccountEvent | null => {
	const legacy = toLegacyAccountEvent(event);
	return (
		legacy && {
			...legacy,
			proof: legacy.proof as AccountEvent['proof'],
			createdAt: legacy.createdAt.toISOString(),
		}
	);
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
// the same address, its labels for the keys (by public key), and who
// created it.
export const toLegacyMultisigWithMembers = ({
	signerSet,
	proposers,
	labels,
	origin,
}: MultisigAccount): LegacyMultisigWithMembers => ({
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

// `GET /multisig/:address` only: each proposer with its newest add or remove
// event, null for proposers from before the audit log.
export const toLegacyMultisigWithProposerEvents = ({
	proposerEvents,
	...multisig
}: MultisigAccount & {
	proposerEvents: Map<string, AccountEventRecord>;
}) => {
	const legacy = toLegacyMultisigWithMembers(multisig);
	return {
		...legacy,
		proposers: legacy.proposers.map((proposer) => ({
			...proposer,
			event: toLegacyAccountEvent(
				proposerEvents.get(proposer.address),
			),
		})),
	};
};

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

// The public view of a proposal, by digest. The proposers are hidden on
// purpose, as this is not public information worth sharing. The same goes
// for key labels (`account_keys`): they are only ever returned on
// authenticated routes. The multisig composition is public, so that is fine.
export const toLegacyPublicProposal = (
	proposal: ProposalWithSignatures,
	signerSet: SignerSetWithMembers,
	currentWeight: number,
	// Added after the freeze (additive), as the last field.
	events: ProposalEvents,
): PublicProposal => ({
	...toLegacyProposalWithSignatures(proposal),
	// What JSON makes of the Date anyway; the SDK types it as the string.
	createdAt: proposal.createdAt.toISOString(),
	currentWeight,
	totalWeight: signerSet.threshold,
	multisig: {
		address: signerSet.address,
		name: signerSet.name,
		threshold: signerSet.threshold,
		members: signerSet.members.map((member) => ({
			publicKey: member.publicKey,
			weight: member.weight,
			order: member.order,
		})),
	},
	events: {
		created: toPublicAccountEvent(events.created),
		proposer: toPublicAccountEvent(events.proposer),
	},
});

export const toLegacyPaginatedProposals = (
	page: PaginatedResponse<ProposalWithSignatures>,
): PaginatedResponse<LegacyProposalWithSignatures> => ({
	...page,
	data: page.data.map(toLegacyProposalWithSignatures),
});
