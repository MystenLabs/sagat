// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	TransactionError,
	type SuiClientTypes,
} from '@mysten/sui/client';
import {
	Transaction,
	type TransactionData,
} from '@mysten/sui/transactions';
import { and, eq } from 'drizzle-orm';

import { db } from '../db';
import {
	ProposalStatus,
	SchemaProposals,
	type Proposal,
} from '../db/schema';
import {
	MultisigEventType,
	multisigProposalEvents,
} from '../metrics';
import {
	getChainInfo,
	getCheckpointTimestamp,
	getSuiClient,
	type SuiNetwork,
} from '../utils/client';

// Where the chain is at: the current epoch, and when it started.
type ChainTime = Pick<
	SuiClientTypes.SystemStateInfo,
	'epoch' | 'epochStartTimestampMs'
>;

// What transactions are checked against: where the chain is at, and which
// chain it is.
type ChainNow = {
	systemState: ChainTime;
	chainIdentifier: string;
};

// Whether a transaction's expiration has passed: its last epoch is over, or
// its latest time is before the current epoch even started.
export const hasExpired = (
	expiration: TransactionData['expiration'],
	now: ChainTime,
) => {
	switch (expiration?.$kind) {
		case 'Epoch':
			return BigInt(now.epoch) > BigInt(expiration.Epoch);
		case 'ValidDuring':
		case 'Validity': {
			const { maxEpoch, maxTimestamp } =
				expiration.$kind === 'ValidDuring'
					? expiration.ValidDuring
					: expiration.Validity;
			return (
				(maxEpoch != null &&
					BigInt(now.epoch) > BigInt(maxEpoch)) ||
				(maxTimestamp != null &&
					BigInt(now.epochStartTimestampMs) >
						BigInt(maxTimestamp))
			);
		}
		default:
			return false;
	}
};

const canExpire = (tx: Transaction) => {
	const { expiration } = tx.getData();
	return !!expiration && expiration.$kind !== 'None';
};

// The chain info the transactions are checked against, looked up only when
// one of them can expire (which is when it can also be bound to a network).
export const loadChainInfo = async (
	transactions: Transaction[],
	network: SuiNetwork,
) =>
	transactions.some(canExpire)
		? getChainInfo(network)
		: null;

const EXPIRED = 'it has expired';

// Why a transaction can never execute (it's bound to another network, or it
// expired), or null if it still can. `chainInfo` must have been loaded for
// it.
export const whyInvalid = (
	tx: Transaction,
	chainInfo: ChainNow | null,
) => {
	if (!chainInfo) return null;
	const { expiration } = tx.getData();
	const chain =
		expiration?.$kind === 'ValidDuring'
			? expiration.ValidDuring.chain
			: expiration?.$kind === 'Validity'
				? expiration.Validity.chain
				: null;
	if (chain !== null && chain !== chainInfo.chainIdentifier)
		return 'it is for another network';
	if (hasExpired(expiration, chainInfo.systemState))
		return EXPIRED;
	return null;
};

// The last epoch a transaction can execute in, if it has one.
export const lastEpoch = (
	expiration: TransactionData['expiration'],
) => {
	switch (expiration?.$kind) {
		case 'Epoch':
			return BigInt(expiration.Epoch);
		case 'ValidDuring':
		case 'Validity': {
			const { maxEpoch } =
				expiration.$kind === 'ValidDuring'
					? expiration.ValidDuring
					: expiration.Validity;
			return maxEpoch == null ? null : BigInt(maxEpoch);
		}
		default:
			return null;
	}
};

// `createdAt` is stored without a time zone, so it may be off by the
// database's offset from UTC.
const CREATED_AT_MARGIN_MS = 24 * 60 * 60 * 1000;

// Whether the node that couldn't find a transaction would have it if it had
// executed. The node must still have every transaction since `since`
// (fullnodes prune old ones, after about two weeks on mainnet), and have
// executed every checkpoint of the epochs up to `lastEpoch`, if given
// (a node can report a new epoch before it serves the last checkpoints of
// the one before).
export const provesNeverExecuted = async (
	network: SuiNetwork,
	notFound: TransactionError,
	since: Date,
	lastEpoch: bigint | null,
) => {
	// Sent along with the error, so they're from the node that answered.
	const meta =
		(
			notFound.cause as
				| { meta?: Record<string, string | string[]> }
				| undefined
		)?.meta ?? {};
	const lowest = meta['x-sui-lowest-available-checkpoint'];
	const epoch = meta['x-sui-epoch'];
	try {
		if (typeof lowest !== 'string') return false;
		if (
			lastEpoch !== null &&
			!(
				typeof epoch === 'string' &&
				BigInt(epoch) > lastEpoch
			)
		)
			return false;
		const oldest = await getCheckpointTimestamp(
			network,
			BigInt(lowest),
		);
		return oldest <= since.getTime() - CREATED_AT_MARGIN_MS;
	} catch {
		return false;
	}
};

// Moves a pending proposal to SUCCESS or FAILURE once its transaction is on
// chain, or to INVALID if it isn't and `invalidReason` says it never can.
// Returns whether the proposal moved.
export const finalizeProposal = async (
	proposal: Proposal,
	invalidReason: string | null,
) => {
	const network = proposal.network as SuiNetwork;
	const tx = await getSuiClient(network)
		.getTransaction({
			digest: proposal.digest,
			include: { effects: true },
		})
		.catch((error) => {
			if (
				error instanceof TransactionError &&
				error.reason === 'notFound'
			)
				return error;
			throw error;
		});

	if (
		tx instanceof TransactionError &&
		!(
			invalidReason &&
			(await provesNeverExecuted(
				network,
				tx,
				proposal.createdAt,
				// One that expired could have run until its last epoch.
				invalidReason === EXPIRED
					? lastEpoch(
							Transaction.from(
								proposal.transactionBytes,
							).getData().expiration,
						)
					: null,
			))
		)
	)
		return false;

	const status =
		tx instanceof TransactionError
			? ProposalStatus.INVALID
			: tx.$kind !== 'FailedTransaction' &&
				  tx.Transaction.effects.status.success
				? ProposalStatus.SUCCESS
				: ProposalStatus.FAILURE;

	const updated = await db
		.update(SchemaProposals)
		.set({ status })
		.where(
			and(
				eq(SchemaProposals.id, proposal.id),
				eq(SchemaProposals.status, ProposalStatus.PENDING),
			),
		)
		.returning({ id: SchemaProposals.id });

	// Another request may have finalized it first.
	if (updated.length > 0)
		multisigProposalEvents.inc({
			network: proposal.network,
			event_type: {
				[ProposalStatus.SUCCESS]:
					MultisigEventType.PROPOSAL_SUCCESS,
				[ProposalStatus.FAILURE]:
					MultisigEventType.PROPOSAL_FAILURE,
				[ProposalStatus.INVALID]:
					MultisigEventType.PROPOSAL_INVALID,
			}[status],
		});

	return true;
};

// Finalizes the pending proposals that can never execute (or already did,
// but weren't verified), so they stop blocking new ones. Returns the rest.
export const finalizeStaleProposals = async (
	proposals: Proposal[],
	chainInfo: ChainNow | null,
) => {
	const finalized = await Promise.all(
		proposals.map((proposal) => {
			const invalidReason = whyInvalid(
				Transaction.from(proposal.transactionBytes),
				chainInfo,
			);
			// Best effort: one that isn't finalized stays pending.
			return invalidReason
				? finalizeProposal(proposal, invalidReason).catch(
						() => false,
					)
				: false;
		}),
	);
	return proposals.filter((_, i) => !finalized[i]);
};
