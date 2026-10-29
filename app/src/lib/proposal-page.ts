// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// What the proposal page shows, kept free of React: where the proposal
// stands, the Approvals card's rows and lines, the cancel dialog's
// wording and the Activity card's rows.
import type { PublicProposal } from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';

import { joinList } from './create-multisig';
import { type EpochInfo } from './expiration';
import {
	isProposalExpired,
	proposalStatusKey,
	type ProposalStatusKey,
} from './proposalUtils';
import { validatePublicKey } from './sui-utils';
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

/** "Threshold 4 of 7": the threshold out of every member's weight. */
export function thresholdLabel(
	multisig: Pick<
		PageProposal['multisig'],
		'threshold' | 'members'
	>,
) {
	const total = multisig.members.reduce(
		(sum, member) => sum + member.weight,
		0,
	);
	return `Threshold ${multisig.threshold} of ${total}`;
}

const addressOf = (publicKey: string) =>
	validatePublicKey(publicKey).address ?? null;

/** A key's label, else its short address. */
function nameOf(address: string | null, labels: Labels) {
	if (!address) return 'Unknown key';
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
) {
	if (
		executing &&
		(status === 'pending' || status === 'ready')
	)
		return 'Threshold reached. Executing…';
	if (status === 'pending')
		return `Needs ${proposal.totalWeight - proposal.currentWeight} more weight.`;
	if (status === 'ready')
		return 'Threshold reached. Ready to execute.';
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
	if (executing)
		return 'Submitted to the network. Waiting for it to confirm, this usually takes a few seconds. You can leave this page.';
	if (status === 'executed') return null;
	if (status === 'failed')
		return "This proposal can't be retried. Propose it again to collect new signatures.";
	if (status === 'cancelled')
		return "Cancelled, so it can't be signed or executed.";
	if (viewer === 'outsider')
		return "Only this account's signers can sign or execute it.";
	if (viewer === 'elsewhere') return null;
	if (status === 'expired')
		return "Expired, so it can't be signed or executed. Cancel it to take it off the open proposals.";

	if (status === 'ready') {
		if (simulation === 'failed')
			return "Execute simulates it again first, in case something has changed, like the account's balance.";
		return gas
			? `Gas is paid from the account, about ${gas}.`
			: 'Gas is paid from the account.';
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
	if (simulation === 'failed')
		return 'Signing adds your approval to a transaction that would fail as things stand.';
	if (simulation === 'unknown')
		return "The transaction couldn't be simulated. Check it in your wallet before you sign.";
	if (wouldReachThreshold(proposal, publicKey))
		return executeAfterSigning
			? 'Your signature reaches the threshold. Gas is paid from the account.'
			: 'Your signature reaches the threshold.';
	const after = missing - yourWeight(proposal, publicKey);
	return after > 0
		? `Needs ${after} more weight after yours.`
		: null;
}

/** "Not enough gas." → "Not enough gas", so a sentence can follow. */
export function trimPeriod(message: string) {
	return message.trim().replace(/\.$/, '');
}

/**
 * Once the viewer signed: who can still approve it, by name when any one
 * of the others is enough, else the weight still missing.
 */
function waitingNote(
	proposal: Pick<PageProposal, 'multisig' | 'signatures'>,
	labels: Labels,
	publicKey: string | null | undefined,
	missing: number,
) {
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
		const names = others.map((member) =>
			nameOf(addressOf(member.publicKey), labels),
		);
		return names.length === 1
			? `You signed. ${names[0]} can approve it.`
			: `You signed. Any one of ${joinList(names, 'or')} can approve it.`;
	}
	return `You signed. Needs ${missing} more weight from the other signers.`;
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
	const name = (address: string | null) => {
		const base = nameOf(address, labels);
		return address && address === currentAddress
			? `${base} (you)`
			: base;
	};

	const proposerSignature = proposal.signatures.find(
		(sig) =>
			addressOf(sig.publicKey) === proposal.proposerAddress,
	);
	const rows: Omit<ActivityRow, 'tone'>[] = [
		{
			key: 'proposed',
			text: `${proposerSignature ? 'Proposed and signed' : 'Proposed'} by ${name(proposal.proposerAddress)}`,
			at: proposal.createdAt,
		},
	];
	for (const sig of proposal.signatures) {
		if (sig === proposerSignature) continue;
		rows.push({
			key: `signed-${sig.publicKey}`,
			text: `Signed by ${name(addressOf(sig.publicKey))}`,
			at: null,
		});
	}
	if (proposal.currentWeight >= proposal.totalWeight)
		rows.push({
			key: 'threshold',
			text: 'Threshold reached',
			at: null,
		});

	const end = {
		executed: { text: 'Executed', at: confirmedAt },
		failed: { text: 'Execution failed', at: confirmedAt },
		cancelled: { text: 'Cancelled', at: null },
		expired: { text: 'Expired', at: null },
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
