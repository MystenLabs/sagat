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

// What the chain says about some transactions, looked up once so that
// several checks can share it.
export type ChainState = {
	// The current state of each object the transactions use at an exact
	// version, or null for one that no longer exists.
	objects: Map<string, SuiClientTypes.Object | null>;
};

export const loadChainState = async (
	transactions: Transaction[],
	network: SuiNetwork,
): Promise<ChainState> => ({
	objects: await getCurrentObjects(
		transactions
			.flatMap(pinnedObjectRefs)
			.map((ref) => ref.objectId),
		network,
	),
});

// Why a transaction can never execute (an object it uses at an exact
// version has since changed or been deleted), or null if it still can.
// `state` must have been loaded for it. Note that executing the transaction
// itself changes its objects too.
export const whyInvalid = (
	tx: Transaction,
	state: ChainState,
) => {
	const changed = pinnedObjectRefs(tx)
		.filter(
			(ref) =>
				state.objects.get(ref.objectId)?.version !==
				String(ref.version),
		)
		.map((ref) => ref.objectId);
	if (changed.length > 0)
		return `objects it uses have changed: ${changed.join(', ')}`;
	return null;
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
