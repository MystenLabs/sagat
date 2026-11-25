// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// What the proposal page shows, kept free of React: where the proposal
// stands, the Approvals card's rows and lines, the cancel dialog's
// wording and the Activity card's rows.
import {
	checkSignerChange,
	signerChangeProof,
} from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import { formatAddress } from '@mysten/sui/utils';

import { content } from '../content';
import { joinList } from './create-multisig';
import { type EpochInfo } from './expiration';
import {
	isExternalProposer,
	isProposalExpired,
	missingWeight,
	proposalStatusKey,
	reachesThreshold,
	shownSignerSet,
	type CountedProposal,
	type CountedSignerSet,
	type ProposalStatusKey,
} from './proposalUtils';
import { podAt, type ListedPod } from './signer-sets';
import {
	sameAddress,
	validatePublicKey,
} from './sui-utils';
import { approvalsThresholdLabel } from './threshold';
import {
	gasCost,
	gasLabel,
	type SimulatedTransaction,
} from './transaction-preview';

const STATUS = content.proposal.approvals.status;
const NOTES = content.proposal.approvals.notes;
const SIGNER_CHANGE =
	content.proposal.approvals.signerChange;

type PageProposal = Pick<
	CountedProposal,
	| 'status'
	| 'transactionBytes'
	| 'checkedSignerSets'
	| 'signatures'
	| 'proposerAddress'
	| 'createdAt'
	| 'accountAddress'
	| 'signerSets'
>;

/** Each member's address and its key's label, or null when unlabelled. */
export type Labels = Map<string, string | null>;

/** Where the proposal stands, `expired` included once the epoch is known. */
export function proposalPageStatus(
	proposal: Pick<
		PageProposal,
		'status' | 'transactionBytes' | 'checkedSignerSets'
	>,
	epochInfo: EpochInfo | undefined,
): ProposalStatusKey {
	return isProposalExpired(proposal, epochInfo)
		? 'expired'
		: proposalStatusKey(proposal);
}

/** Whether the signatures reached the threshold, executed or not. */
export function thresholdReached(
	status: ProposalStatusKey,
) {
	return (
		status === 'ready' ||
		status === 'executed' ||
		status === 'failed'
	);
}

const addressOf = (publicKey: string) =>
	validatePublicKey(publicKey).address ?? null;

/** A key's label, else its short address. */
function nameOf(address: string | null, labels: Labels) {
	if (!address) return content.common.unknownKey;
	return labels.get(address) || formatAddress(address);
}

/** Whether `publicKey` signed the proposal. */
export function hasSigned(
	proposal: Pick<PageProposal, 'signatures'>,
	publicKey: string | null | undefined,
) {
	return (
		!!publicKey &&
		proposal.signatures.some(
			(sig) => sig.publicKey === publicKey,
		)
	);
}

/** The viewer's weight in the signer set; 0 when they are not a member. */
export function yourWeight(
	set: Pick<CountedSignerSet, 'members'>,
	publicKey: string | null | undefined,
) {
	return (
		set.members.find(
			(member) => member.publicKey === publicKey,
		)?.weight ?? 0
	);
}

/** Whether the viewer's signature, still to come, would reach the threshold of a checked set that holds them. */
export function wouldReachThreshold(
	proposal: Pick<PageProposal, 'checkedSignerSets'>,
	publicKey: string | null | undefined,
) {
	return proposal.checkedSignerSets.some((set) => {
		const weight = yourWeight(set, publicKey);
		return (
			weight > 0 &&
			set.currentWeight + weight >= set.threshold
		);
	});
}

export interface ApprovalRow {
	publicKey: string;
	address: string | null;
	label: string | null;
	/** The avatar's letter: the label's first, else the address's first hex digit. */
	initial: string;
	signed: boolean;
	isYou: boolean;
	/** What the row says on its right. */
	state: 'signed' | 'not-signed' | 'not-needed';
}

/**
 * One row per member of the signer set, in composition order. A member
 * who didn't sign is "Not needed" once the threshold is reached, unless
 * the signer change warning names them (`notSigned`).
 */
export function approvalRows(
	set: Pick<CountedSignerSet, 'members'>,
	proposal: Pick<PageProposal, 'signatures'>,
	status: ProposalStatusKey,
	labels: Labels,
	publicKey: string | null | undefined,
	notSigned: readonly string[] = [],
): ApprovalRow[] {
	const reached = thresholdReached(status);
	return [...set.members]
		.sort((a, b) => a.order - b.order)
		.map((member) => {
			const address = addressOf(member.publicKey);
			const label =
				(address && labels.get(address)) || null;
			const signed = hasSigned(proposal, member.publicKey);
			return {
				publicKey: member.publicKey,
				address,
				label,
				initial: (
					(label && [...label.trim()][0]) ||
					address?.charAt(2) ||
					'?'
				).toUpperCase(),
				signed,
				isYou: member.publicKey === publicKey,
				state: signed
					? 'signed'
					: reached && !notSigned.includes(member.publicKey)
						? 'not-needed'
						: 'not-signed',
			};
		});
}

/** A checked signer set's part of the Approvals card, when the proposal has several. */
export interface ApprovalsSignerSet {
	/** Rebuilt from the members and threshold. */
	address: string;
	currentWeight: number;
	threshold: number;
	/** The viewer's pod at the set's address, for a set other than the pod's own. */
	podName: string | null;
	heading: string;
	/** "Threshold reached." while open, else how far the set is from it while pending. */
	line: string | null;
	rows: ApprovalRow[];
}

/** One part per checked signer set in `countSignerSets` order, the first being the main set, each counted on its own. */
export function approvalsSignerSets(
	proposal: Pick<
		PageProposal,
		'checkedSignerSets' | 'signatures' | 'accountAddress'
	>,
	status: ProposalStatusKey,
	labels: Labels,
	publicKey: string | null | undefined,
	pods: readonly ListedPod[],
	notSigned: readonly string[] = [],
): ApprovalsSignerSet[] {
	const open = status === 'pending' || status === 'ready';
	return proposal.checkedSignerSets.map((set) => ({
		address: set.address,
		currentWeight: set.currentWeight,
		threshold: set.threshold,
		podName: sameAddress(
			set.address,
			proposal.accountAddress,
		)
			? null
			: (podAt(pods, set.address)?.name ?? null),
		heading: approvalsThresholdLabel(set),
		// Once ready, a set short of its threshold isn't needed.
		line: !open
			? null
			: reachesThreshold(set)
				? STATUS.reached
				: status === 'pending'
					? STATUS.needs(missingWeight(set))
					: null,
		rows: approvalRows(
			set,
			proposal,
			status,
			labels,
			publicKey,
			notSigned,
		),
	}));
}

/** The folded row's line, only when a folded set reached its threshold or, while pending, misses less than the main set. */
export function foldedSignerSetsLine(
	[main, ...folded]: readonly ApprovalsSignerSet[],
	status: ProposalStatusKey,
): string | null {
	if (!main || (status !== 'pending' && status !== 'ready'))
		return null;
	if (folded.some(reachesThreshold)) return STATUS.reached;
	if (status !== 'pending' || folded.length === 0)
		return null;
	const closest = Math.min(...folded.map(missingWeight));
	return closest < missingWeight(main)
		? STATUS.needs(closest)
		: null;
}

/** The line under the Approvals heading while executing or once ready; a pending count is the main set's `line`. */
export function approvalsStatus(
	status: ProposalStatusKey,
	executing: boolean,
	simulation: SimulationVerdict,
) {
	if (
		executing &&
		(status === 'pending' || status === 'ready')
	)
		return STATUS.executing;
	if (status === 'ready')
		return simulation === 'failed'
			? STATUS.reached
			: STATUS.ready;
	if (status === 'executed') return STATUS.executed;
	if (status === 'failed') return STATUS.failed;
	return null;
}

/**
 * While a pending signer change's signers who stay haven't signed for
 * the new threshold, the warning naming them and their keys. Null for
 * bytes without a composition note that checks against `aliases`, the
 * pod's alias set from the app's node (null until read).
 */
export function signerChangeWarning(
	proposal: Pick<
		PageProposal,
		'transactionBytes' | 'signatures'
	>,
	status: ProposalStatusKey,
	aliases: readonly string[] | null,
	labels: Labels,
): { body: string; notSigned: string[] } | null {
	if (
		!aliases ||
		(status !== 'pending' && status !== 'ready')
	)
		return null;
	let proof;
	try {
		proof = signerChangeProof(
			checkSignerChange(
				Transaction.from(
					proposal.transactionBytes,
				).getData(),
				aliases,
			),
			proposal.signatures.map((sig) => sig.publicKey),
		);
	} catch {
		return null;
	}
	if (proof.met || proof.notSigned.length === 0)
		return null;
	const names = proof.notSigned.map((key) =>
		nameOf(addressOf(key), labels),
	);
	return {
		body: SIGNER_CHANGE.body(
			joinList(names, 'and'),
			names.length,
		),
		notSigned: proof.notSigned,
	};
}

/**
 * Which cancel dialog the viewer gets: `alone` when nobody else signed,
 * so no one else loses anything; `others` otherwise.
 */
export function cancelVariant(
	proposal: Pick<PageProposal, 'signatures'>,
	publicKey: string | null | undefined,
): 'alone' | 'others' {
	return proposal.signatures.some(
		(sig) => sig.publicKey !== publicKey,
	)
		? 'others'
		: 'alone';
}

/** The gas a dry run or the executed transaction used, as a cost, "0.0041 SUI"; null without one or for a rebate. */
export function gasEstimate(
	result:
		| Pick<SimulatedTransaction, 'effects'>
		| null
		| undefined,
) {
	if (!result) return null;
	const cost = gasCost(result.effects.gasUsed);
	return cost > 0n ? gasLabel(cost) : null;
}

export type SimulationVerdict =
	| 'pending'
	| 'passed'
	| 'failed'
	/** No dry run result (not run, offline, a timeout): no verdict. */
	| 'unknown';

export interface ApprovalsNoteInput {
	proposal: Pick<
		PageProposal,
		'checkedSignerSets' | 'signatures'
	>;
	status: ProposalStatusKey;
	labels: Labels;
	publicKey: string | null | undefined;
	/**
	 * `member` can act; `elsewhere` is a member on another network than
	 * the proposal's, whom the network banner speaks to; `outsider`
	 * isn't a member, or isn't connected.
	 */
	viewer: 'member' | 'elsewhere' | 'outsider';
	simulation: SimulationVerdict;
	/** The Execute after signing box is ticked. */
	executeAfterSigning: boolean;
	executing: boolean;
	/** The dry run's gas cost, from `gasEstimate`. */
	gas: string | null;
}

/** The note under the Approvals card's actions. */
export function approvalsNote({
	proposal,
	status,
	labels,
	publicKey,
	viewer,
	simulation,
	executeAfterSigning,
	executing,
	gas,
}: ApprovalsNoteInput): string | null {
	if (executing) return NOTES.executing;
	if (status === 'executed') return null;
	if (status === 'failed') return NOTES.failed;
	if (status === 'cancelled') return NOTES.cancelled;
	if (viewer === 'outsider') return NOTES.outsider;
	if (viewer === 'elsewhere') return null;
	if (status === 'expired') return NOTES.expired;

	if (status === 'ready') {
		if (simulation === 'failed') return NOTES.readyFailing;
		return gas ? NOTES.gasPaidAbout(gas) : NOTES.gasPaid;
	}

	// Pending.
	const shown = shownSignerSet(proposal.checkedSignerSets);
	if (!shown) return null;
	const missing = missingWeight(shown);
	if (hasSigned(proposal, publicKey))
		return waitingNote(proposal, labels, publicKey);
	if (simulation === 'pending') return null;
	if (simulation === 'failed') return NOTES.signingFailing;
	if (simulation === 'unknown') return NOTES.notSimulated;
	if (wouldReachThreshold(proposal, publicKey))
		return executeAfterSigning
			? NOTES.reachesThresholdGas
			: NOTES.reachesThreshold;
	const after = missing - yourWeight(shown, publicKey);
	return after > 0 ? NOTES.needsAfterYours(after) : null;
}

/** "Not enough gas." → "Not enough gas", so a sentence can follow. */
export function trimPeriod(message: string) {
	return message.trim().replace(/\.$/, '');
}

/** ": Not enough gas" to follow a clause, or nothing without a message. */
export function withReason(message: string): string {
	return message ? `: ${trimPeriod(message)}` : '';
}

// More signers than this go unnamed in the waiting note.
const MAX_NAMED_SIGNERS = 3;

/**
 * Once the viewer signed: who can still approve it, by name when in
 * every checked set any one of the others is enough (up to three of
 * them, each named once), else the weight the closest set still misses.
 */
function waitingNote(
	proposal: Pick<
		PageProposal,
		'checkedSignerSets' | 'signatures'
	>,
	labels: Labels,
	publicKey: string | null | undefined,
) {
	const sets = proposal.checkedSignerSets.map((set) => ({
		missing: missingWeight(set),
		others: [...set.members]
			.sort((a, b) => a.order - b.order)
			.filter(
				(member) =>
					member.publicKey !== publicKey &&
					!hasSigned(proposal, member.publicKey),
			),
	}));
	if (
		sets.every(
			({ missing, others }) =>
				others.length > 0 &&
				others.every((member) => member.weight >= missing),
		)
	) {
		const keys = [
			...new Set(
				sets.flatMap(({ others }) =>
					others.map((member) => member.publicKey),
				),
			),
		];
		if (keys.length > MAX_NAMED_SIGNERS)
			return NOTES.waiting.anyOther;
		const names = keys.map((key) =>
			nameOf(addressOf(key), labels),
		);
		return names.length === 1
			? NOTES.waiting.one(names[0])
			: NOTES.waiting.anyOneOf(joinList(names, 'or'));
	}
	return NOTES.waiting.needs(
		Math.min(...sets.map(({ missing }) => missing)),
	);
}

export interface ActivityRow {
	key: string;
	text: string;
	/** When it happened, when known. */
	at: string | number | null;
	/** The dot: earlier rows, the latest one, or a failure or cancellation. */
	tone: 'past' | 'latest' | 'error';
}

/**
 * What happened to the proposal, oldest first: who proposed it (and
 * signed it, unless they are an outside proposer), every other
 * signature, the threshold when reached, and how it ended. Only the
 * proposal and its end carry a time; signatures aren't timed.
 */
export function activityRows({
	proposal,
	status,
	labels,
	currentAddress,
	confirmedAt = null,
}: {
	proposal: PageProposal;
	status: ProposalStatusKey;
	labels: Labels;
	/** The viewer's address, named "(you)". */
	currentAddress: string | null | undefined;
	/** When the transaction landed, for an executed or failed proposal. */
	confirmedAt?: number | null;
}): ActivityRow[] {
	const copy = content.proposal.activity;
	const name = (address: string | null) => {
		const base = nameOf(address, labels);
		return address && address === currentAddress
			? copy.you(base)
			: base;
	};
	// Marked like the header: "(you)" first, else "(external)".
	const proposer =
		proposal.proposerAddress !== currentAddress &&
		isExternalProposer(proposal)
			? copy.external(name(proposal.proposerAddress))
			: name(proposal.proposerAddress);

	const proposerSignature = proposal.signatures.find(
		(sig) =>
			addressOf(sig.publicKey) === proposal.proposerAddress,
	);
	const rows: Omit<ActivityRow, 'tone'>[] = [
		{
			key: 'proposed',
			text: proposerSignature
				? copy.proposedAndSigned(proposer)
				: copy.proposed(proposer),
			at: proposal.createdAt,
		},
	];
	for (const sig of proposal.signatures) {
		if (sig === proposerSignature) continue;
		rows.push({
			key: `signed-${sig.publicKey}`,
			text: copy.signedBy(name(addressOf(sig.publicKey))),
			at: null,
		});
	}
	// A closed proposal is counted against today's sets, so its status speaks first.
	if (
		thresholdReached(status) ||
		proposal.checkedSignerSets.some(reachesThreshold)
	)
		rows.push({
			key: 'threshold',
			text: copy.thresholdReached,
			at: null,
		});

	const end = {
		executed: { text: copy.executed, at: confirmedAt },
		failed: { text: copy.failed, at: confirmedAt },
		cancelled: { text: copy.cancelled, at: null },
		expired: { text: copy.expired, at: null },
	} as const;
	if (status in end)
		rows.push({
			key: status,
			...end[status as keyof typeof end],
		});

	return rows.map((row, i) => ({
		...row,
		tone:
			row.key === 'failed' || row.key === 'cancelled'
				? 'error'
				: i === rows.length - 1
					? 'latest'
					: 'past',
	}));
}
