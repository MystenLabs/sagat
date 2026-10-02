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
	for (const coin of gasData.payment ?? [])
		if (!isCoinReservation(coin)) refs.push(coin);
	return refs;
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

// Where the chain is at: the current epoch, and when it started.
type ChainTime = Pick<
	SuiClientTypes.SystemStateInfo,
	'epoch' | 'epochStartTimestampMs'
>;

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

// What the chain says about some transactions, looked up once so that
// several checks can share it.
export type ChainState = {
	// The current state of each object the transactions use at an exact
	// version, or null for one that no longer exists.
	objects: Map<string, SuiClientTypes.Object | null>;
	// Only looked up when one of the transactions can expire.
	systemState: ChainTime | null;
	// Only looked up when one of the transactions can expire, which is when
	// it can also be bound to a network.
	chainIdentifier: string | null;
};

export const loadChainState = async (
	transactions: Transaction[],
	network: SuiNetwork,
): Promise<ChainState> => {
	const canExpire = transactions.some((tx) => {
		const { expiration } = tx.getData();
		return expiration && expiration.$kind !== 'None';
	});
	const [objects, chainInfo] = await Promise.all([
		getCurrentObjects(
			transactions
				.flatMap(pinnedObjectRefs)
				.map((ref) => ref.objectId),
			network,
		),
		canExpire ? getChainInfo(network) : null,
	]);
	return {
		objects,
		systemState: chainInfo?.systemState ?? null,
		chainIdentifier: chainInfo?.chainIdentifier ?? null,
	};
};

// Why a transaction can never execute (it's bound to another network, it
// expired, or an object it uses at an exact version has since moved to a
// newer one), or null if it still can. `state` must have been loaded for it.
// Note that executing the transaction itself moves its objects too.
export const whyInvalid = (
	tx: Transaction,
	state: ChainState,
) => {
	const { expiration } = tx.getData();
	const chain =
		expiration?.$kind === 'ValidDuring'
			? expiration.ValidDuring.chain
			: expiration?.$kind === 'Validity'
				? expiration.Validity.chain
				: null;
	if (
		chain !== null &&
		state.chainIdentifier !== null &&
		chain !== state.chainIdentifier
	)
		return 'it is for another network';
	if (
		state.systemState &&
		hasExpired(expiration, state.systemState)
	)
		return 'it has expired';
	const moved = pinnedObjectRefs(tx)
		.filter((ref) =>
			hasMoved(
				ref,
				state.objects.get(ref.objectId)?.version,
			),
		)
		.map((ref) => ref.objectId);
	if (moved.length > 0)
		return `objects it uses have changed: ${moved.join(', ')}`;
	return null;
};

// Whether the node that couldn't find a transaction still has every
// transaction since `since`. Fullnodes prune old transactions (after about
// two weeks on mainnet) but keep the objects they changed, so an object can
// have moved on while the transaction that moved it is gone.
export const keepsHistorySince = async (
	network: SuiNetwork,
	notFound: TransactionError,
	since: Date,
) => {
	// Sent along with the error, so it's from the node that answered.
	const lowest = (
		notFound.cause as
			| { meta?: Record<string, string | string[]> }
			| undefined
	)?.meta?.['x-sui-lowest-available-checkpoint'];
	if (typeof lowest !== 'string') return false;

	const oldest = await getCheckpointTimestamp(
		network,
		BigInt(lowest),
	).catch(() => null);
	return oldest !== null && oldest <= since.getTime();
};

// Moves a pending proposal to SUCCESS or FAILURE once its transaction is on
// chain, or to INVALID if it isn't and `canNeverExecute`. Returns whether
// the proposal moved.
export const finalizeProposal = async (
	proposal: Proposal,
	canNeverExecute: boolean,
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

	// Not finding the transaction only proves it never executed if the node
	// still has every transaction since the proposal was made.
	if (
		tx instanceof TransactionError &&
		!(
			canNeverExecute &&
			(await keepsHistorySince(
				network,
				tx,
				proposal.createdAt,
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

	await db
		.update(SchemaProposals)
		.set({ status })
		.where(
			and(
				eq(SchemaProposals.id, proposal.id),
				eq(SchemaProposals.status, ProposalStatus.PENDING),
			),
		);

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
	// Loaded before looking the transactions up, so a transaction that
	// executes in between is seen on chain rather than marked invalid.
	state: ChainState,
) => {
	const finalized = await Promise.all(
		proposals.map((proposal) =>
			whyInvalid(
				Transaction.from(proposal.transactionBytes),
				state,
			)
				? finalizeProposal(proposal, true)
				: false,
		),
	);
	return proposals.filter((_, i) => !finalized[i]);
};
