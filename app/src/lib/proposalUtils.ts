// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { findAliasCalls } from '@mysten/sagat';
import type {
	Proposal,
	SignerSetMember,
} from '@mysten/sagat/v1';
import { Transaction } from '@mysten/sui/transactions';
import { formatDigest } from '@mysten/sui/utils';

import { content } from '../content';
import { type AliasRead } from './alias-set';
import { getExpiry, type EpochInfo } from './expiration';
import {
	checkedSignerSets,
	isMember,
	type AccountSigners,
} from './proposal-integrity';
import { sameAddress } from './sui-utils';
import { getExplorerUrl } from './utils';

/** The weight of the set's members whose key signed, each counted once. */
export const calculateCurrentWeight = (
	proposal: Pick<Proposal, 'signatures'>,
	signerSet: AccountSigners,
) =>
	signerSet.members
		.filter((member) =>
			proposal.signatures.some(
				(signature) =>
					signature.publicKey === member.publicKey,
			),
		)
		.reduce((total, member) => total + member.weight, 0);

export interface CountedSignerSet {
	/** Rebuilt from the members and threshold, never the API's. */
	address: string;
	threshold: number;
	members: SignerSetMember[];
	currentWeight: number;
}

/** A proposal with its checked signer sets counted, the viewer's first. */
export type CountedProposal = Proposal & {
	checkedSignerSets: CountedSignerSet[];
};

export function reachesThreshold(
	set: Pick<
		CountedSignerSet,
		'currentWeight' | 'threshold'
	>,
) {
	return set.currentWeight >= set.threshold;
}

/** Counts the proposal's signatures in each of `checked`, the sets holding `signerAddress` first, the pod's own leading them. */
export function countSignerSets(
	proposal: Pick<Proposal, 'signatures' | 'accountAddress'>,
	checked: readonly {
		set: AccountSigners;
		address: string;
	}[],
	signerAddress: string | null | undefined,
): CountedSignerSet[] {
	const counted = checked.map(({ set, address }) => ({
		address,
		threshold: set.threshold,
		members: set.members.map(
			({ publicKey, weight, order }) => ({
				publicKey,
				weight,
				order,
			}),
		),
		currentWeight: calculateCurrentWeight(proposal, set),
	}));
	if (!signerAddress) return counted;
	const rank = (set: CountedSignerSet) =>
		!isMember(set, signerAddress)
			? 2
			: sameAddress(set.address, proposal.accountAddress)
				? 0
				: 1;
	return [...counted].sort((a, b) => rank(a) - rank(b));
}

/** The checked set that reached its threshold, the one execution uses; null when none did. */
export function readySignerSet(
	sets: readonly CountedSignerSet[],
): CountedSignerSet | null {
	return sets.find(reachesThreshold) ?? null;
}

// None for bytes that don't decode, which the preview reports itself.
export function aliasCallsIn(bytes: string) {
	try {
		return findAliasCalls(
			Transaction.from(bytes).getData(),
		);
	} catch {
		return [];
	}
}

/** The set a list row executes with; none for a proposal that calls the alias module, which executes from its page. */
export function rowExecuteSet(
	proposal: Pick<
		CountedProposal,
		'checkedSignerSets' | 'transactionBytes'
	>,
): CountedSignerSet | null {
	return aliasCallsIn(proposal.transactionBytes).length > 0
		? null
		: readySignerSet(proposal.checkedSignerSets);
}

/** The one set the screens draw: the ready one, else the first (`countSignerSets` order). */
export function shownSignerSet(
	sets: readonly CountedSignerSet[],
): CountedSignerSet | null {
	return readySignerSet(sets) ?? sets[0] ?? null;
}

/** Whether a listed proposal is `account`'s on `network`. */
export function isPodProposal(
	proposal: Pick<Proposal, 'accountAddress' | 'network'>,
	account: string,
	network: string,
) {
	return (
		proposal.network === network &&
		sameAddress(proposal.accountAddress, account)
	);
}

/** A proposal counted against its signer sets that are aliases in `aliases`, or the one making up its address while unread. */
export function toProposalCardInput(
	proposal: Proposal,
	aliases: AliasRead | undefined,
	signerAddress: string | null | undefined,
): CountedProposal {
	return {
		...proposal,
		checkedSignerSets: countSignerSets(
			proposal,
			checkedSignerSets(
				proposal.signerSets,
				proposal.accountAddress,
				aliases,
			),
			signerAddress,
		),
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
 * signatures reach the threshold of any one checked set, else `pending`.
 */
export function proposalStatusKey(proposal: {
	status: Proposal['status'];
	checkedSignerSets: readonly Pick<
		CountedSignerSet,
		'currentWeight' | 'threshold'
	>[];
}): ProposalStatusKey {
	if (proposal.status === 'SUCCESS') return 'executed';
	if (proposal.status === 'CANCELLED') return 'cancelled';
	if (proposal.status === 'FAILURE') return 'failed';
	if (proposal.checkedSignerSets.some(reachesThreshold))
		return 'ready';
	return 'pending';
}

/**
 * A proposal's transaction on the explorer, once it ran on chain
 * (executed or failed). Null before then, and on networks the explorer
 * doesn't index.
 */
export function proposalExplorerUrl(
	status: ProposalStatusKey,
	proposal: Pick<Proposal, 'digest' | 'network'>,
) {
	if (status !== 'executed' && status !== 'failed')
		return null;
	return getExplorerUrl(proposal.digest, proposal.network);
}

/**
 * Whether a proposal offers Export: not once it is cancelled or expired,
 * as the app has nothing further to do with it. A failed one keeps it,
 * having run on chain.
 */
export function canExportProposal(
	status: ProposalStatusKey,
) {
	return status !== 'cancelled' && status !== 'expired';
}

/** The proposal's description, or its digest when it has none. */
export function proposalTitle(
	proposal: Pick<Proposal, 'description' | 'digest'>,
) {
	const description = proposal.description?.trim();
	if (description) return description;
	return formatDigest(proposal.digest);
}

/**
 * The toast once a signature lands, from the set the voted proposal
 * shows: the weight it still needs, or just the confirmation once it
 * reached its threshold.
 */
export function signatureAddedMessage(
	set: Pick<
		CountedSignerSet,
		'currentWeight' | 'threshold'
	> | null,
) {
	if (!set || reachesThreshold(set))
		return content.toasts.signatureAdded;
	return content.toasts.signatureAddedNeeds(
		set.threshold - set.currentWeight,
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
		proposal.status === 'PENDING' &&
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
		CountedProposal,
		| 'status'
		| 'transactionBytes'
		| 'signatures'
		| 'checkedSignerSets'
	>,
	{
		publicKey,
		epochInfo,
	}: {
		publicKey: string | undefined;
		epochInfo: EpochInfo | undefined;
	},
): 'expired' | 'ready' | 'waiting' | 'pending' {
	if (isProposalExpired(proposal, epochInfo))
		return 'expired';
	if (proposal.checkedSignerSets.some(reachesThreshold))
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
 * Whether the proposer is a member of none of the proposal's signer sets:
 * an address the account allowed to propose without being able to sign.
 */
export function isExternalProposer(proposal: {
	proposerAddress: string;
	signerSets: readonly AccountSigners[];
}) {
	return !proposal.signerSets.some((set) =>
		isMember(set, proposal.proposerAddress),
	);
}

/** One of several lists of rows, each newest first, loaded by page. */
type PagedList<T extends { createdAt: string }> = {
	rows: T[];
	hasNextPage: boolean;
};

const createdAt = (row: { createdAt: string }) =>
	Date.parse(row.createdAt);

// The oldest loaded time of a list with more to load; one with no rows
// yet could still hold anything.
const oldestLoaded = (
	list: PagedList<{ createdAt: string }>,
) => {
	const oldest = list.rows[list.rows.length - 1];
	return oldest ? createdAt(oldest) : Infinity;
};

/**
 * The oldest creation time a merge of `lists` can show for sure. Until a list is
 * fully loaded, its next page can still hold rows newer than another
 * list's loaded ones, so the cutoff is the newest of the oldest loaded
 * rows among the lists with more to load.
 */
export function mergeCutoff(
	lists: PagedList<{ createdAt: string }>[],
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
export function mergeNewestFirst<
	T extends { createdAt: string },
>(lists: PagedList<T>[]): T[] {
	const cutoff = mergeCutoff(lists);
	return lists
		.flatMap((list) => list.rows)
		.filter((row) => createdAt(row) >= cutoff)
		.sort((a, b) => createdAt(b) - createdAt(a));
}

/**
 * Which lists' next page moves the merge on: those with more to load whose
 * oldest loaded row sets the cutoff. Another list's next page would only
 * add rows the cutoff still hides.
 */
export function listsAtCutoff(
	lists: PagedList<{ createdAt: string }>[],
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
}: {
	currentWeight: number;
	totalWeight: number;
}) {
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
