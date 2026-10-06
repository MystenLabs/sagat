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
import { fromBase58 } from '@mysten/sui/utils';
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
	getCurrentObjects,
	getSuiClient,
	type SuiNetwork,
} from '../utils/client';

type ObjectRef = {
	objectId: string;
	version: string | number;
	digest: string;
};

// Coin reservations look like gas coins but withdraw from the address
// balance, so there's no object whose version could change. Mirrors
// `isCoinReservationDigest` in @mysten/sui, which isn't exported.
const isCoinReservation = (ref: ObjectRef) =>
	fromBase58(ref.digest)
		.slice(12)
		.every((byte) => byte === 0xac);

// The objects a transaction uses at an exact version: its owned, immutable
// and receiving inputs, and its gas coins.
export const pinnedObjectRefs = (
	tx: Transaction,
): ObjectRef[] => {
	const { inputs, gasData } = tx.getData();
	const refs: ObjectRef[] = [];
	for (const input of inputs) {
		if (input.$kind !== 'Object') continue;
		if (input.Object.$kind === 'ImmOrOwnedObject')
			refs.push(input.Object.ImmOrOwnedObject);
		if (input.Object.$kind === 'Receiving')
			refs.push(input.Object.Receiving);
	}
	refs.push(...(gasData.payment ?? []));
	return refs.filter((ref) => !isCoinReservation(ref));
};

// Whether an object has moved past the version a transaction pins. Only a
// newer version proves it: versions only go up, so an older one just means
// the node that answered is behind, and a missing object may be one it hasn't
// seen yet (deleted ones look the same, so those stay undecided).
export const hasMoved = (
	ref: ObjectRef,
	currentVersion: string | null | undefined,
) =>
	currentVersion != null &&
	BigInt(currentVersion) > BigInt(ref.version);

// The objects a transaction uses that have moved on since, so it can't
// execute anymore (or it already did). `objects` must have been looked up
// for it.
export const movedObjects = (
	tx: Transaction,
	objects: Map<string, SuiClientTypes.Object | null>,
) =>
	pinnedObjectRefs(tx)
		.filter((ref) =>
			hasMoved(ref, objects.get(ref.objectId)?.version),
		)
		.map((ref) => ref.objectId);

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

// What the chain says about some transactions, looked up once so that
// several checks can share it.
export type ChainState = {
	// The current state of each object the transactions use at an exact
	// version, or null for one that no longer exists.
	objects: Map<string, SuiClientTypes.Object | null>;
	chainInfo: ChainNow | null;
};

// Why a transaction can never execute (it's bound to another network, it
// expired, or an object it uses at an exact version has since moved to a
// newer one), or null if it still can. `state` must have been loaded for it.
// Note that executing the transaction itself moves its objects too.
export const whyInvalid = (
	tx: Transaction,
	{ objects, chainInfo }: ChainState,
) => {
	const { expiration } = tx.getData();
	const chain =
		expiration?.$kind === 'ValidDuring'
			? expiration.ValidDuring.chain
			: expiration?.$kind === 'Validity'
				? expiration.Validity.chain
				: null;
	if (
		chainInfo &&
		chain !== null &&
		chain !== chainInfo.chainIdentifier
	)
		return 'it is for another network';
	if (
		chainInfo &&
		hasExpired(expiration, chainInfo.systemState)
	)
		return EXPIRED;
	const moved = movedObjects(tx, objects);
	if (moved.length > 0)
		return `objects it uses have changed: ${moved.join(', ')}`;
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

export const loadChainState = async (
	transactions: Transaction[],
	network: SuiNetwork,
): Promise<ChainState> => {
	const [objects, chainInfo] = await Promise.all([
		getCurrentObjects(
			transactions
				.flatMap(pinnedObjectRefs)
				.map((ref) => ref.objectId),
			network,
		),
		loadChainInfo(transactions, network),
	]);
	return { objects, chainInfo };
};

// Finalizes the pending proposals that can never execute, or already did
// without being verified, where that's proven. Returns the ones still
// pending, and of those the ones that still hold on to their objects (one
// that can never execute doesn't, even when that isn't proven enough to
// finalize it).
export const finalizeStaleProposals = async (
	proposals: Proposal[],
	// Loaded before looking the transactions up, so a transaction that
	// executes in between is seen on chain.
	state: ChainState,
) => {
	const results = await Promise.all(
		proposals.map(async (proposal) => {
			const tx = Transaction.from(
				proposal.transactionBytes,
			);
			const invalidReason = whyInvalid(tx, state);
			if (!invalidReason)
				return { finalized: false, holds: true };
			// Best effort: one that isn't finalized stays pending.
			const finalized = await finalizeProposal(
				proposal,
				invalidReason,
			).catch(() => false);
			return { finalized, holds: false };
		}),
	);
	const pending = proposals.filter(
		(_, i) => !results[i].finalized,
	);
	const holding = proposals.filter(
		(_, i) => !results[i].finalized && results[i].holds,
	);
	return { pending, holding };
};
