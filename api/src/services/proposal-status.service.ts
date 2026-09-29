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
	getObjectVersions,
	getSuiClient,
	getSystemState,
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
const pinnedObjectRefs = (tx: Transaction): ObjectRef[] => {
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

// Why each transaction can never execute (it expired, or an object it uses
// at an exact version has since moved to a newer one), or null if it still
// can. Note that executing the transaction itself moves them too.
export const findInvalidTransactions = async (
	transactions: Transaction[],
	network: SuiNetwork,
) => {
	const data = transactions.map((tx) => tx.getData());
	const refs = transactions.map(pinnedObjectRefs);
	const canExpire = data.some(
		({ expiration }) =>
			expiration && expiration.$kind !== 'None',
	);
	const [versions, now] = await Promise.all([
		getObjectVersions(
			refs.flat().map((ref) => ref.objectId),
			network,
		),
		canExpire ? getSystemState(network) : null,
	]);
	return transactions.map((_, i) => {
		if (now && hasExpired(data[i].expiration, now))
			return 'it has expired';
		const moved = refs[i]
			.filter((ref) =>
				hasMoved(ref, versions.get(ref.objectId)),
			)
			.map((ref) => ref.objectId);
		if (moved.length > 0)
			return `objects it uses have changed: ${moved.join(', ')}`;
		return null;
	});
};

// Moves a pending proposal to SUCCESS or FAILURE once its transaction is on
// chain, or to INVALID if it isn't and `canNeverExecute`. Returns whether
// the proposal moved.
export const finalizeProposal = async (
	proposal: Proposal,
	canNeverExecute: boolean,
) => {
	const tx = await getSuiClient(
		proposal.network as SuiNetwork,
	)
		.getTransaction({
			digest: proposal.digest,
			include: { effects: true },
		})
		.catch((error) => {
			if (
				error instanceof TransactionError &&
				error.reason === 'notFound'
			)
				return null;
			throw error;
		});

	if (!tx && !canNeverExecute) return false;

	const status = !tx
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
	network: SuiNetwork,
) => {
	// Checked before looking the transactions up, so a transaction that
	// executes in between is seen on chain rather than marked invalid.
	const invalidReasons = await findInvalidTransactions(
		proposals.map((p) =>
			Transaction.from(p.transactionBytes),
		),
		network,
	);
	const finalized = await Promise.all(
		proposals.map((proposal, i) =>
			invalidReasons[i]
				? finalizeProposal(proposal, true)
				: false,
		),
	);
	return proposals.filter((_, i) => !finalized[i]);
};
