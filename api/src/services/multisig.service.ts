// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type PublicKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db';
import {
	ProposalStatus,
	SchemaMultisigMembers,
	SchemaProposals,
} from '../db/schema';
import { NotFoundError, ValidationError } from '../errors';
import { MultisigDataLoader } from '../loaders/multisig.loader';
import { type SuiNetwork } from '../utils/client';
import {
	finalizeStaleProposals,
	loadChainState,
	pinnedObjectRefs,
} from './proposal-status.service';

// Returns the multisig with its members.
export const getMultisig = async (address: string) => {
	const multisig = await MultisigDataLoader.load(address);
	if (!multisig) throw new NotFoundError();
	return multisig;
};

export const validateQuorum = async (
	addresses: string[],
	weights: number[],
	threshold: number,
) => {
	if (addresses.length !== weights.length) {
		throw new ValidationError(
			'Addresses and weights must be the same length',
		);
	}

	if (addresses.length > 10 || addresses.length < 2) {
		throw new ValidationError(
			'Addresses cannot be more than 10 or less than 2',
		);
	}

	// validate weights.
	weights.forEach((weight) => {
		if (weight <= 0) {
			throw new ValidationError(
				'Weights must be greater than 0',
			);
		}
		if (weight > 255) {
			throw new ValidationError(
				'Weights must be less than 256',
			);
		}
	});

	// prevent duplicates
	const uniqueAddresses = Array.from(new Set(addresses));
	if (uniqueAddresses.length !== addresses.length) {
		throw new ValidationError('Addresses must be unique');
	}

	if (
		threshold >
		weights.reduce((acc, weight) => acc + weight, 0)
	) {
		throw new ValidationError(
			'Threshold must be less than the sum of weights',
		);
	}

	if (threshold < 1) {
		throw new ValidationError(
			'Threshold must be greater or equal to 1',
		);
	}
};

// Returns true if the multisig is finalized (all members have accepted the invitation).
export const isMultisigFinalized = async (
	address: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tx?: any,
) => {
	const query = tx ? tx.query : db.query;
	const isFinalized =
		await query.SchemaMultisigMembers.findMany({
			where: and(
				eq(SchemaMultisigMembers.multisigAddress, address),
				eq(SchemaMultisigMembers.isAccepted, false),
			),
		});

	return isFinalized.length === 0;
};

// Returns true if the public key is a member of the multisig and has accepted the invitation.
export const isMultisigMember = async (
	msigAddress: string,
	publicKey: PublicKey,
	checkAcceptance: boolean = true,
) => {
	const whereConditions = [
		eq(SchemaMultisigMembers.multisigAddress, msigAddress),
		eq(
			SchemaMultisigMembers.publicKey,
			publicKey.toSuiPublicKey(),
		),
	];

	if (checkAcceptance) {
		whereConditions.push(
			eq(SchemaMultisigMembers.isAccepted, true),
		);
	}

	const member =
		await db.query.SchemaMultisigMembers.findFirst({
			where: and(...whereConditions),
		});
	return !!member;
};

// A convenient checker to see if ANY of the JWT addresses from the header
// have acess to the requested multisig.
export const jwtHasMultisigMemberAccess = async (
	msigAddress: string,
	publicKeys: PublicKey[],
	checkAcceptance: boolean = true,
) => {
	const whereConditions = [
		eq(SchemaMultisigMembers.multisigAddress, msigAddress),
		inArray(
			SchemaMultisigMembers.publicKey,
			publicKeys.map((key) => key.toSuiPublicKey()),
		),
	];

	if (checkAcceptance) {
		whereConditions.push(
			eq(SchemaMultisigMembers.isAccepted, true),
		);
	}

	const member =
		await db.query.SchemaMultisigMembers.findFirst({
			where: and(...whereConditions),
		});

	return !!member;
};

// Get a list of pending proposals for a given multisig address.
export const getPendingProposals = async (
	multisigAddress: string,
	network: string,
) => {
	const proposals = await db.query.SchemaProposals.findMany(
		{
			where: and(
				eq(
					SchemaProposals.multisigAddress,
					multisigAddress,
				),
				eq(SchemaProposals.status, ProposalStatus.PENDING),
				eq(SchemaProposals.network, network),
			),
		},
	);
	return proposals;
};

// Validates a proposed transaction.
export const validateProposedTransaction = async (
	proposedTransaction: Transaction,
	multisigAddress: string,
	network: SuiNetwork,
) => {
	// Make sure the transaction is fully resolved. We do not currently allow unresolved txs.
	if (!proposedTransaction.isFullyResolved()) {
		throw new ValidationError(
			'The transaction is not fully resolved.',
		);
	}

	if (
		proposedTransaction.getData().sender !== multisigAddress
	) {
		throw new ValidationError(
			'The transaction sender does not match the multisig address.',
		);
	}

	const pendingProposals = await getPendingProposals(
		multisigAddress,
		network,
	);

	//   Fail early on duplicats, avoid doing RPC calls.
	const digest = await proposedTransaction.getDigest();
	if (pendingProposals.some((p) => p.digest === digest)) {
		throw new ValidationError(
			'A proposal with the same digest already exists.',
		);
	}

	// Look up everything the checks below need from the chain at once.
	const pendingTransactions = pendingProposals.map((p) =>
		Transaction.from(p.transactionBytes),
	);
	const state = await loadChainState(
		pendingTransactions,
		network,
	);

	// Leave out the pending proposals that can never execute (or already
	// did), which no longer hold on to their objects.
	const stillPending = await finalizeStaleProposals(
		pendingProposals,
		state,
	);

	if (stillPending.length >= 10) {
		throw new ValidationError(
			'You cannot have more than 10 pending proposals at the same time. Please cancel or execute some proposals before proceeding.',
		);
	}

	// The objects the pending proposals pin at a version, except immutable
	// ones, which can be shared. One the node didn't return stays held.
	// Make sure we do not have any of these in our proposal.
	const objectIds = (tx: Transaction) =>
		pinnedObjectRefs(tx).map((ref) => ref.objectId);
	const pendingOwnedObjects = new Set(
		stillPending
			.flatMap((p) =>
				objectIds(Transaction.from(p.transactionBytes)),
			)
			.filter(
				(objectId) =>
					state.objects.get(objectId)?.owner.$kind !==
					'Immutable',
			),
	);
	const reusedObjects = objectIds(
		proposedTransaction,
	).filter((objectId) => pendingOwnedObjects.has(objectId));

	if (reusedObjects.length > 0) {
		throw new ValidationError(
			'You cannot have re-use any owned or receiving objects that are already in pending proposals. The used objects are: ' +
				reusedObjects.join(', '),
		);
	}
};
