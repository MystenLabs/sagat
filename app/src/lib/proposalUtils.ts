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

import { content } from '../content';
import { getExpiry, type EpochInfo } from './expiration';
import { validatePublicKey } from './sui-utils';
import { type ProposalCardInput } from './types';

/** The parts of an account that weigh a proposal's signatures. */
type Composition = Pick<
	MultisigWithMembers,
	'threshold'
> & {
	members: Pick<
		MultisigWithMembers['members'][number],
		'publicKey' | 'weight'
	>[];
};

// Helper to calculate current weight of a proposal based on signatures
export const calculateCurrentWeight = (
	proposal: Pick<ProposalWithSignatures, 'signatures'>,
	multisigDetails: Composition | undefined,
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
	multisigDetails: Composition | undefined,
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
		totalWeight: multisig.threshold,
		currentWeight: calculateCurrentWeight(
			proposal,
			multisig,
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

/**
 * Where a proposal stands. `expired` is a pending proposal whose
 * transaction can no longer execute; that takes the chain's current epoch,
 * so `proposalStatusKey` never returns it and callers that know the epoch
 * use `isProposalExpired` on top.
 */
export type ProposalStatusKey =
	| 'executed'
	| 'cancelled'
	| 'failed'
	| 'ready'
	| 'pending'
	| 'expired';

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

/** The proposal's description, or its digest when it has none. */
export function proposalTitle(
	proposal: Pick<Proposal, 'description' | 'digest'>,
) {
	const description = proposal.description?.trim();
	if (description) return description;
	return content.proposals.untitled(
		formatDigest(proposal.digest),
	);
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
	if (vote.hasReachedThreshold)
		return content.toasts.signatureAdded;
	return content.toasts.signatureAddedNeeds(
		totalWeight - vote.currentWeight,
	);
}

/**
 * Whether a proposal is still pending but its transaction is past its
 * last epoch, so it can never execute. Until the epoch is known, nothing
 * counts as expired.
 */
export function isProposalExpired(
	proposal: Pick<Proposal, 'status' | 'transactionBytes'>,
	epochInfo: EpochInfo | undefined,
) {
	return (
		proposal.status === ProposalStatus.PENDING &&
		!!epochInfo &&
		!!getExpiry(proposal.transactionBytes, epochInfo)
			?.expired
	);
}

/**
 * Which of the proposals page's pending tabs a pending proposal belongs
 * on: Expired once its transaction can't execute, whatever its
 * signatures; else Ready at the threshold; else Awaiting others when
 * `publicKey` signed it, To sign when not.
 */
export function pendingFilter(
	proposal: Pick<
		ProposalWithSignatures,
		'status' | 'transactionBytes' | 'signatures'
	>,
	{
		multisig,
		publicKey,
		epochInfo,
	}: {
		multisig: Composition | undefined;
		publicKey: string | undefined;
		epochInfo: EpochInfo | undefined;
	},
): 'expired' | 'ready' | 'waiting' | 'pending' {
	if (isProposalExpired(proposal, epochInfo))
		return 'expired';
	if (
		calculateCurrentWeight(proposal, multisig) >=
		getTotalWeight(multisig)
	)
		return 'ready';
	return proposal.signatures.some(
		(sig) => sig.publicKey === publicKey,
	)
		? 'waiting'
		: 'pending';
}

/** A proposal's public page, as a path. */
export function sharedProposalPath(digest: string) {
	return `/proposals?digest=${encodeURIComponent(digest)}`;
}

/** The link to a proposal's public page. */
export function proposalLinkUrl(digest: string) {
	return `${window.location.origin}${sharedProposalPath(digest)}`;
}

/** The account's proposals list. */
export function proposalsPath(address: string) {
	return `/multisig/${address}/proposals`;
}

/** A proposal's page under its account. */
export function proposalPagePath(
	address: string,
	digest: string,
) {
	return `/multisig/${address}/proposals/${digest}`;
}

/**
 * A digest cut to its first ten and last four characters, e.g.
 * "HkV4y3pGsy…E7ac". `formatDigest` keeps only the head; the list shows
 * both ends.
 */
export function shortDigest(digest: string) {
	if (digest.length <= 14) return digest;
	return `${digest.slice(0, 10)}…${digest.slice(-4)}`;
}

/**
 * Whether the proposer is not one of the account's signers: an address
 * the account allowed to propose without being able to sign.
 */
export function isExternalProposer(
	proposal: Pick<
		ProposalCardInput,
		'multisig' | 'proposerAddress'
	>,
) {
	return !proposal.multisig.members.some(
		(member) =>
			validatePublicKey(member.publicKey).address ===
			proposal.proposerAddress,
	);
}

/** One of several lists of rows, each newest first, loaded by page. */
type PagedList<T extends { id: number }> = {
	rows: T[];
	hasNextPage: boolean;
};

// The oldest loaded id of a list with more to load; one with no rows yet
// could still hold anything.
const oldestLoaded = (list: PagedList<{ id: number }>) =>
	list.rows[list.rows.length - 1]?.id ?? Infinity;

/**
 * The oldest id a merge of `lists` can show for sure. Until a list is
 * fully loaded, its next page can still hold rows newer than another
 * list's loaded ones, so the cutoff is the newest of the oldest loaded
 * rows among the lists with more to load.
 */
export function mergeCutoff(
	lists: PagedList<{ id: number }>[],
) {
	return Math.max(
		-Infinity,
		...lists
			.filter((list) => list.hasNextPage)
			.map(oldestLoaded),
	);
}

/**
 * Lists that each come newest first, merged into one, down to
 * `mergeCutoff`; the rest show once the pages above them arrive.
 */
export function mergeNewestFirst<T extends { id: number }>(
	lists: PagedList<T>[],
): T[] {
	const cutoff = mergeCutoff(lists);
	return lists
		.flatMap((list) => list.rows)
		.filter((row) => row.id >= cutoff)
		.sort((a, b) => b.id - a.id);
}

/**
 * Which lists' next page moves the merge on: those with more to load whose
 * oldest loaded row sets the cutoff. Another list's next page would only
 * add rows the cutoff still hides.
 */
export function listsAtCutoff(
	lists: PagedList<{ id: number }>[],
) {
	const cutoff = mergeCutoff(lists);
	return lists.flatMap((list, index) =>
		list.hasNextPage && oldestLoaded(list) === cutoff
			? [index]
			: [],
	);
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
