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
}: Omit<LinkedSignerSet, 'labels'>) => ({
	address: signerSet.address,
	label: link.label,
	status: link.status,
	isVerified: signerSet.isVerified,
	threshold: signerSet.threshold,
	totalWeight: signerSet.totalWeight,
	draftedBy: link.draftedBy,
	createdAt: link.createdAt,
});

export const toSignerSetWithMembers = ({
	link,
	signerSet,
	labels,
}: LinkedSignerSet) => ({
	...toSignerSet({ link, signerSet }),
	members: signerSet.members.map((member) =>
		toSignerSetMember(member, labels),
	),
});

export const toAccount = ({
	account,
	proposers,
	signerSets,
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

export const toProposalPage = (
	page: PaginatedResponse<ProposalWithSignatures>,
) => ({
	data: page.data.map(toProposalWithSignatures),
	hasNextPage: page.hasNextPage,
	nextCursor: page.nextCursor,
	perPage: page.perPage,
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
