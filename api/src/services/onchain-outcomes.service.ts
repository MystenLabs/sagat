// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { findAliasCalls } from '@mysten/sagat';
import { TransactionError } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { and, eq, inArray, sql } from 'drizzle-orm';

import {
	ProposalStatus,
	SchemaProposals,
	type Proposal,
} from '../db/schema';
import { type DatabaseTransaction } from '../db/transaction';
import {
	MultisigEventType,
	multisigProposalEvents,
} from '../metrics';
import {
	getSuiClient,
	type SuiNetwork,
} from '../utils/client';
import { signerAddressOf } from '../utils/pubKey';

export type OnChainOutcome = {
	status: ProposalStatus.SUCCESS | ProposalStatus.FAILURE;
	// The address that signed for the sender.
	executedVia: string | null;
};

// The calls to `0x2::address_alias` in a proposal's bytes.
export const aliasCallsOf = (transactionBytes: string) =>
	findAliasCalls(
		Transaction.from(transactionBytes).getData(),
	);

// The outcome of a transaction on chain, or null when the node does not have it.
export const lookUpOnChainOutcome = async (
	network: SuiNetwork,
	digest: string,
): Promise<OnChainOutcome | null> => {
	const tx = await getSuiClient(network)
		.getTransaction({ digest, include: { effects: true } })
		.catch((error) => {
			if (
				error instanceof TransactionError &&
				error.reason === 'notFound'
			)
				return null;
			throw error;
		});
	if (!tx) return null;

	const isSuccess =
		tx.$kind !== 'FailedTransaction' &&
		!!tx.Transaction.effects.status.success;
	// The sender's signature comes first.
	const [senderSignature] = (
		tx.$kind === 'Transaction'
			? tx.Transaction
			: tx.FailedTransaction
	).signatures;
	return {
		status: isSuccess
			? ProposalStatus.SUCCESS
			: ProposalStatus.FAILURE,
		executedVia: senderSignature
			? signerAddressOf(senderSignature)
			: null,
	};
};

// Records the outcome while the proposal is still pending or cancelled. False when it already had one.
export const recordOnChainOutcome = async (
	executor: Pick<DatabaseTransaction, 'update'>,
	proposal: Pick<Proposal, 'id' | 'network'>,
	outcome: OnChainOutcome,
) => {
	const recorded = await executor
		.update(SchemaProposals)
		.set({
			status: outcome.status,
			executedVia: outcome.executedVia,
		})
		.where(
			and(
				eq(SchemaProposals.id, proposal.id),
				inArray(SchemaProposals.status, [
					ProposalStatus.PENDING,
					ProposalStatus.CANCELLED,
				]),
			),
		)
		.returning({ id: SchemaProposals.id });
	if (recorded.length === 0) return false;

	multisigProposalEvents.inc({
		network: proposal.network,
		event_type:
			outcome.status === ProposalStatus.SUCCESS
				? MultisigEventType.PROPOSAL_SUCCESS
				: MultisigEventType.PROPOSAL_FAILURE,
	});
	return true;
};

// Can only over-match: a Move call's BCS holds its module name as a string.
const mayCallAliasModule = sql`position(convert_to('address_alias', 'UTF8') in decode(${SchemaProposals.transactionBytes}, 'base64')) > 0`;

// The account's proposals on the network, in the statuses, that call the alias module.
export const findAliasProposals = async (
	executor: Pick<DatabaseTransaction, 'select'>,
	accountAddress: string,
	network: SuiNetwork,
	statuses: ProposalStatus[],
): Promise<Proposal[]> => {
	const candidates = await executor
		.select()
		.from(SchemaProposals)
		.where(
			and(
				eq(SchemaProposals.accountAddress, accountAddress),
				eq(SchemaProposals.network, network),
				inArray(SchemaProposals.status, statuses),
				mayCallAliasModule,
			),
		);
	return candidates.filter(
		(proposal) =>
			aliasCallsOf(proposal.transactionBytes).length > 0,
	);
};
