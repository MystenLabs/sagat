// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// What the proposal page shows, kept free of React: where the proposal
// stands, the Approvals card's rows and lines, the cancel dialog's
// wording and the Activity card's rows.
import type { PublicProposal } from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';

import { content } from '../content';
import { joinList } from './create-multisig';
import { type EpochInfo } from './expiration';
import {
	isExternalProposer,
	isProposalExpired,
	proposalStatusKey,
	type ProposalStatusKey,
} from './proposalUtils';
import { validatePublicKey } from './sui-utils';
import { sumWeight, thresholdLabel } from './threshold';
import {
	gasCost,
	gasLabel,
	type SimulatedTransaction,
} from './transaction-preview';

type PageProposal = Pick<
	PublicProposal,
	| 'status'
	| 'transactionBytes'
	| 'currentWeight'
	| 'totalWeight'
	| 'signatures'
	| 'multisig'
	| 'proposerAddress'
	| 'createdAt'
>;

/** Each member's address and its key's label, or null when unlabelled. */
export type Labels = Map<string, string | null>;

/** Where the proposal stands, `expired` included once the epoch is known. */
export function proposalPageStatus(
	proposal: Pick<
		PageProposal,
		| 'status'
		| 'transactionBytes'
		| 'currentWeight'
		| 'totalWeight'
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

/** "Threshold 4 of 7", the Approvals card's heading: the shared wording, labelled. */
export function approvalsThresholdLabel(
	multisig: Pick<
		PageProposal['multisig'],
		'threshold' | 'members'
	>,
) {
	return content.proposal.approvals.threshold(
		thresholdLabel({
			threshold: multisig.threshold,
			totalWeight: sumWeight(multisig.members),
		}),
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

/** The viewer's weight in the composition; 0 when they are not a member. */
export function yourWeight(
	proposal: Pick<PageProposal, 'multisig'>,
	publicKey: string | null | undefined,
) {
	return (
		proposal.multisig.members.find(
			(member) => member.publicKey === publicKey,
		)?.weight ?? 0
	);
}

/** Whether the viewer's signature, still to come, would reach the threshold. */
export function wouldReachThreshold(
	proposal: Pick<
		PageProposal,
		'multisig' | 'currentWeight' | 'totalWeight'
	>,
	publicKey: string | null | undefined,
) {
	const weight = yourWeight(proposal, publicKey);
	return (
		weight > 0 &&
		proposal.currentWeight + weight >= proposal.totalWeight
	);
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
 * One row per member in composition order. A member who didn't sign is
 * "Not needed" once the threshold is reached.
 */
export function approvalRows(
	proposal: Pick<PageProposal, 'multisig' | 'signatures'>,
	status: ProposalStatusKey,
	labels: Labels,
	publicKey: string | null | undefined,
): ApprovalRow[] {
	const reached = thresholdReached(status);
	return [...proposal.multisig.members]
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
					: reached
						? 'not-needed'
						: 'not-signed',
			};
		});
}

/** The line under the Approvals heading; null once the proposal closed. */
export function approvalsStatus(
	proposal: Pick<
		PageProposal,
		'currentWeight' | 'totalWeight'
	>,
	status: ProposalStatusKey,
	executing: boolean,
	simulation: SimulationVerdict,
) {
	const copy = content.proposal.approvals.status;
	if (
		executing &&
		(status === 'pending' || status === 'ready')
	)
		return copy.executing;
	if (status === 'pending')
		return copy.needs(
			proposal.totalWeight - proposal.currentWeight,
		);
	if (status === 'ready')
		return simulation === 'failed'
			? copy.readyFailing
			: copy.ready;
	return null;
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

/** The dry run's gas as a cost, "0.0041 SUI"; null without a run or for a rebate. */
export function gasEstimate(
	result: SimulatedTransaction | null | undefined,
) {
	if (!result) return null;
	const cost = gasCost(result.effects.gasUsed);
	return cost > 0n ? gasLabel(cost) : null;
}

export type SimulationVerdict =
	| 'pending'
	| 'passed'
	| 'failed'
	/** The dry run couldn't run (offline, a timeout): no verdict. */
	| 'unknown';

export interface ApprovalsNoteInput {
	proposal: Pick<
		PageProposal,
		| 'multisig'
		| 'signatures'
		| 'currentWeight'
		| 'totalWeight'
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
	const copy = content.proposal.approvals.notes;
	if (executing) return copy.executing;
	if (status === 'executed') return null;
	if (status === 'failed') return copy.failed;
	if (status === 'cancelled') return copy.cancelled;
	if (viewer === 'outsider') return copy.outsider;
	if (viewer === 'elsewhere') return null;
	if (status === 'expired') return copy.expired;

	if (status === 'ready') {
		if (simulation === 'failed') return copy.readyFailing;
		return gas ? copy.gasPaidAbout(gas) : copy.gasPaid;
	}

	// Pending.
	const missing =
		proposal.totalWeight - proposal.currentWeight;
	if (hasSigned(proposal, publicKey))
		return waitingNote(
			proposal,
			labels,
			publicKey,
			missing,
		);
	if (simulation === 'pending') return null;
	if (simulation === 'failed') return copy.signingFailing;
	if (simulation === 'unknown') return copy.notSimulated;
	if (wouldReachThreshold(proposal, publicKey))
		return executeAfterSigning
			? copy.reachesThresholdGas
			: copy.reachesThreshold;
	const after = missing - yourWeight(proposal, publicKey);
	return after > 0 ? copy.needsAfterYours(after) : null;
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
 * Once the viewer signed: who can still approve it, by name when any one
 * of the others is enough (up to three of them), else the weight still
 * missing.
 */
function waitingNote(
	proposal: Pick<PageProposal, 'multisig' | 'signatures'>,
	labels: Labels,
	publicKey: string | null | undefined,
	missing: number,
) {
	const copy = content.proposal.approvals.notes.waiting;
	const others = [...proposal.multisig.members]
		.sort((a, b) => a.order - b.order)
		.filter(
			(member) =>
				member.publicKey !== publicKey &&
				!hasSigned(proposal, member.publicKey),
		);
	if (
		others.length > 0 &&
		others.every((member) => member.weight >= missing)
	) {
		if (others.length > MAX_NAMED_SIGNERS)
			return copy.anyOther;
		const names = others.map((member) =>
			nameOf(addressOf(member.publicKey), labels),
		);
		return names.length === 1
			? copy.one(names[0])
			: copy.anyOneOf(joinList(names, 'or'));
	}
	return copy.needs(missing);
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
	if (proposal.currentWeight >= proposal.totalWeight)
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
