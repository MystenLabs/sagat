// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Maps what the services return to the `/v1` response shapes in
 * `./schemas`. Each function builds its object field by field, so a new
 * column never reaches a response by accident.
 */

import {
	type Proposal,
	type ProposalWithSignatures,
	type SignerSetMember,
} from '../db/schema';
import { type KeyLabels } from '../loaders/account-keys.loader';
import {
	type AccountWithSignerSets,
	type LinkedSignerSet,
	type SignerSetComposition,
	type SignerSetInvitation,
} from '../services/accounts.service';
import { type SignerSetTally } from '../services/proposals.service';
import { type PaginatedResponse } from '../utils/pagination';

export const toSignerSetMember = (
	member: SignerSetMember,
	labels: KeyLabels,
) => ({
	signerSetAddress: member.signerSetAddress,
	publicKey: member.publicKey,
	weight: member.weight,
	order: member.order,
	isAccepted: member.isAccepted,
	isRejected: member.isRejected,
	label: labels.get(member.publicKey) ?? null,
});

// A signer set without its members, so without key labels.
export const toSignerSet = ({
	link,
	signerSet,
	validOn,
}: Omit<LinkedSignerSet, 'labels'>) => ({
	address: signerSet.address,
	label: link.label,
	status: link.status,
	isVerified: signerSet.isVerified,
	threshold: signerSet.threshold,
	totalWeight: signerSet.totalWeight,
	draftedBy: link.draftedBy,
	createdAt: link.createdAt,
	validOn: [...validOn],
});

export const toSignerSetWithMembers = ({
	labels,
	...linked
}: LinkedSignerSet) => ({
	...toSignerSet(linked),
	members: linked.signerSet.members.map((member) =>
		toSignerSetMember(member, labels),
	),
});

// A composition outside any account: members without key labels, and the
// links the caller may see.
export const toSignerSetComposition = ({
	signerSet,
	links,
}: SignerSetComposition) => ({
	address: signerSet.address,
	threshold: signerSet.threshold,
	isVerified: signerSet.isVerified,
	totalWeight: signerSet.totalWeight,
	members: signerSet.members.map((member) => ({
		signerSetAddress: member.signerSetAddress,
		publicKey: member.publicKey,
		weight: member.weight,
		order: member.order,
		isAccepted: member.isAccepted,
		isRejected: member.isRejected,
	})),
	links: links.map(({ link, account, validOn }) => ({
		accountAddress: account.address,
		accountName: account.name,
		label: link.label,
		status: link.status,
		draftedBy: link.draftedBy,
		createdAt: link.createdAt,
		validOn: [...validOn],
	})),
});

export const toSignerSetInvitation = ({
	account,
	...linked
}: SignerSetInvitation) => ({
	...toSignerSetWithMembers(linked),
	accountAddress: account.address,
	accountName: account.name,
});

export const toAccount = ({
	account,
	proposers,
	signerSets,
	aliases,
}: AccountWithSignerSets) => ({
	address: account.address,
	name: account.name,
	createdAt: account.createdAt,
	proposers: proposers.map((proposer) => ({
		accountAddress: account.address,
		address: proposer.address,
		addedBy: proposer.addedBy,
		addedAt: proposer.addedAt,
	})),
	signerSets: signerSets.map(toSignerSetWithMembers),
	aliases: aliases.map(
		({ network, addresses, observedAt }) => ({
			network,
			addresses: [...addresses],
			observedAt,
		}),
	),
});

export const toProposal = (proposal: Proposal) => ({
	id: proposal.id,
	accountAddress: proposal.accountAddress,
	digest: proposal.digest,
	status: proposal.status,
	transactionBytes: proposal.transactionBytes,
	proposerAddress: proposal.proposerAddress,
	description: proposal.description,
	network: proposal.network,
	createdAt: proposal.createdAt,
	executedVia: proposal.executedVia,
});

export const toProposalWithSignatures = (
	proposal: ProposalWithSignatures,
) => ({
	...toProposal(proposal),
	signatures: proposal.signatures.map((signature) => ({
		proposalId: signature.proposalId,
		publicKey: signature.publicKey,
		signature: signature.signature,
	})),
});

// The public view of a proposal. Members are listed with whether they
// signed, never with the account's labels for their keys.
export const toPublicProposal = ({
	proposal,
	signerSets,
}: {
	proposal: ProposalWithSignatures;
	signerSets: SignerSetTally[];
}) => ({
	...toProposalWithSignatures(proposal),
	signerSets: signerSets.map(
		({
			link,
			signerSet,
			currentWeight,
			hasReachedThreshold,
		}) => ({
			address: signerSet.address,
			label: link.label,
			threshold: signerSet.threshold,
			totalWeight: signerSet.totalWeight,
			currentWeight,
			hasReachedThreshold,
			members: signerSet.members.map((member) => ({
				publicKey: member.publicKey,
				weight: member.weight,
				order: member.order,
				hasSigned: proposal.signatures.some(
					(s) => s.publicKey === member.publicKey,
				),
			})),
		}),
	),
});

// A page of proposals, each with its tally per valid signer set.
export const toProposalPage = (
	page: PaginatedResponse<{
		proposal: ProposalWithSignatures;
		signerSets: SignerSetTally[];
	}>,
) => ({
	data: page.data.map(toPublicProposal),
	hasNextPage: page.hasNextPage,
	nextCursor: page.nextCursor,
	perPage: page.perPage,
});
