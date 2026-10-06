// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	TransactionError,
	type SuiClientTypes,
} from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
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

// Moves a pending proposal to SUCCESS or FAILURE if its transaction is on
// chain. Returns whether it was.
export const recordExecution = async (
	proposal: Proposal,
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
	if (!tx) return false;

	const isSuccess =
		tx.$kind !== 'FailedTransaction' &&
		tx.Transaction.effects.status.success;

	const updated = await db
		.update(SchemaProposals)
		.set({
			status: isSuccess
				? ProposalStatus.SUCCESS
				: ProposalStatus.FAILURE,
		})
		.where(
			and(
				eq(SchemaProposals.id, proposal.id),
				eq(SchemaProposals.status, ProposalStatus.PENDING),
			),
		)
		.returning({ id: SchemaProposals.id });

	// Another request may have recorded it first.
	if (updated.length > 0)
		multisigProposalEvents.inc({
			network: proposal.network,
			event_type: isSuccess
				? MultisigEventType.PROPOSAL_SUCCESS
				: MultisigEventType.PROPOSAL_FAILURE,
		});

	return true;
};

// The pending proposals that can still execute, and so hold on to their
// objects. The rest had objects move on since: they either executed without
// being verified (which this records) or never can. Either way a new
// proposal can only use the newer versions, so they can't collide. They
// still count as pending until they're verified or cancelled.
export const stillExecutable = async (
	proposals: Proposal[],
	// Looked up before the transactions, so one that executes in between is
	// seen on chain.
	objects: Map<string, SuiClientTypes.Object | null>,
) => {
	const stale = await Promise.all(
		proposals.map(async (proposal) => {
			const tx = Transaction.from(
				proposal.transactionBytes,
			);
			if (movedObjects(tx, objects).length === 0)
				return false;
			// It's released either way, so recording it can fail.
			await recordExecution(proposal).catch(() => false);
			return true;
		}),
	);
	return proposals.filter((_, i) => !stale[i]);
};
