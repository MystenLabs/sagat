// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	type MultisigWithMembers,
	type Proposal,
	type ProposalWithSignatures,
	type VoteProposalResponse,
} from '@mysten/sagat';
import { formatDigest } from '@mysten/sui/utils';

import { type ProposalCardInput } from './types';

// Helper to calculate current weight of a proposal based on signatures
export const calculateCurrentWeight = (
	proposal: ProposalWithSignatures,
	multisigDetails: MultisigWithMembers | undefined,
) => {
	if (!multisigDetails?.members) return 0;

	let currentWeight = 0;
	for (const signature of proposal.signatures) {
		const member = multisigDetails.members.find(
			(m) => m.publicKey === signature.publicKey,
		);
		if (member) {
			currentWeight += member.weight;
		}
	}
	return currentWeight;
};

// Helper to get total weight (threshold) for the multisig
export const getTotalWeight = (
	multisigDetails: MultisigWithMembers | undefined,
) => {
	return multisigDetails?.threshold || 0;
};

/**
 * A proposal as the cards and tables show it: its weights come from the
 * account's current members, and it carries the composition the execute
 * flow needs.
 */
export function toProposalCardInput(
	proposal: ProposalWithSignatures,
	multisig: MultisigWithMembers,
): ProposalCardInput {
	return {
		...proposal,
		isPublic: false,
		totalWeight: multisig.threshold,
		currentWeight: calculateCurrentWeight(
			proposal,
			multisig,
		),
		proposers: multisig.proposers.map(
			(proposer) => proposer.address,
		),
		multisig: {
			address: multisig.address,
			name: multisig.name,
			threshold: multisig.threshold,
			// A copy, so nothing downstream touches the cached array.
			members: [...multisig.members],
		},
	};
}

export type ProposalStatusKey =
	'executed' | 'cancelled' | 'failed' | 'ready' | 'pending';

/**
 * Where a proposal stands: its terminal status, else `ready` once the
 * signatures reach the threshold, else `pending`.
 */
export function proposalStatusKey(
	proposal: Pick<
		Proposal,
		'status' | 'currentWeight' | 'totalWeight'
	>,
): ProposalStatusKey {
	if (proposal.status === ProposalStatus.SUCCESS)
		return 'executed';
	if (proposal.status === ProposalStatus.CANCELLED)
		return 'cancelled';
	if (proposal.status === ProposalStatus.FAILURE)
		return 'failed';
	if (proposal.currentWeight >= proposal.totalWeight)
		return 'ready';
	return 'pending';
}

/** The proposal's description, cut short, or its digest when it has none. */
export function proposalTitle(
	proposal: Pick<Proposal, 'description' | 'digest'>,
) {
	const description = proposal.description?.trim();
	if (description) {
		return description.length > 50
			? `${description.slice(0, 50)}…`
			: description;
	}
	return `Transaction ${formatDigest(proposal.digest)}`;
}

/**
 * The toast once a signature lands: the weight the proposal still needs
 * after the vote's tally, or just the confirmation once the vote reached
 * the proposal's threshold.
 */
export function signatureAddedMessage(
	vote: VoteProposalResponse,
	totalWeight: number,
) {
	if (vote.hasReachedThreshold) return 'Signature added';
	return `Signature added. Needs ${totalWeight - vote.currentWeight} more weight.`;
}

/** At most this many dots stand for a proposal's weight. */
const MAX_WEIGHT_DOTS = 10;

/**
 * How many dots show a proposal's progress toward its threshold, and how
 * many of them are filled. One dot per unit of weight up to
 * `MAX_WEIGHT_DOTS`; past that the dots scale, so the tooltip carries the
 * exact numbers. Scaled, any weight fills a dot and only the threshold
 * fills them all.
 */
export function weightDots({
	currentWeight,
	totalWeight,
}: Pick<Proposal, 'currentWeight' | 'totalWeight'>) {
	const total = Math.max(totalWeight, 1);
	const current = Math.min(
		Math.max(currentWeight, 0),
		total,
	);
	if (total <= MAX_WEIGHT_DOTS)
		return { dots: total, filled: current };
	if (current === total)
		return {
			dots: MAX_WEIGHT_DOTS,
			filled: MAX_WEIGHT_DOTS,
		};
	if (current === 0)
		return { dots: MAX_WEIGHT_DOTS, filled: 0 };
	// Partial weight shows at least one dot and never all of them.
	const scaled = Math.round(
		(current / total) * MAX_WEIGHT_DOTS,
	);
	return {
		dots: MAX_WEIGHT_DOTS,
		filled: Math.min(
			Math.max(scaled, 1),
			MAX_WEIGHT_DOTS - 1,
		),
	};
}
