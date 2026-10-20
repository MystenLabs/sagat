// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type PublicKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { and, eq, inArray } from 'drizzle-orm';

import { LIMITS } from '../constants/limits';
import { db } from '../db';
import {
	ProposalStatus,
	SchemaAccountSignerSets,
	SchemaProposals,
	SchemaSignerSetMembers,
} from '../db/schema';
import { NotFoundError, ValidationError } from '../errors';
import {
	toLegacyMultisigWithMembers,
	type SignerSetOrigin,
} from '../legacy/serializers';
import { AccountKeyLabelsDataLoader } from '../loaders/account-keys.loader';
import { AccountProposersDataLoader } from '../loaders/account-proposers.loader';
import { SignerSetDataLoader } from '../loaders/signer-set.loader';
import {
	queryAllOwnedObjects,
	type SuiNetwork,
} from '../utils/client';

// Returns the signer set with its members.
export const getSignerSet = async (address: string) => {
	const signerSet = await SignerSetDataLoader.load(address);
	if (!signerSet) throw new NotFoundError();
	return signerSet;
};

// Who created the account and when, from its link row for its original
// composition: `(A, A)` in `account_signer_sets`. Null when the account has
// no such row. These columns never change after the row is inserted.
export const getAccountOrigin = async (
	address: string,
): Promise<SignerSetOrigin | null> =>
	(await db.query.SchemaAccountSignerSets.findFirst({
		columns: { draftedBy: true, createdAt: true },
		where: and(
			eq(SchemaAccountSignerSets.accountAddress, address),
			eq(SchemaAccountSignerSets.signerSetAddress, address),
		),
	})) ?? null;

// The legacy multisig shape: a signer set with the account's proposers. A
// signer set without the account's link row for its original composition
// (a draft for another account) is not a multisig to legacy clients.
export const getLegacyMultisig = async (
	address: string,
) => {
	const [signerSet, origin, proposers, labels] =
		await Promise.all([
			SignerSetDataLoader.load(address),
			getAccountOrigin(address),
			AccountProposersDataLoader.load(address),
			AccountKeyLabelsDataLoader.load(address),
		]);
	if (!signerSet || !origin) throw new NotFoundError();
	return toLegacyMultisigWithMembers(
		signerSet,
		proposers,
		labels,
		origin,
	);
};

/**
 * Bounds the member count of a create request. Pure and cheap, so the
 * create route runs it before anything is sized by `publicKeys.length`:
 * an unbounded length from the request body must never reach an
 * allocation.
 */
export const validateMemberCount = (members: unknown) => {
	if (
		!Array.isArray(members) ||
		members.length > LIMITS.maxMembersPerMultisig ||
		members.length < LIMITS.minMembersPerMultisig
	) {
		throw new ValidationError(
			`Addresses cannot be more than ${LIMITS.maxMembersPerMultisig} or less than ${LIMITS.minMembersPerMultisig}`,
		);
	}
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

	validateMemberCount(addresses);

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

// Returns true if the signer set is finalized (all members have accepted the invitation).
export const isSignerSetFinalized = async (
	address: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tx?: any,
) => {
	const query = tx ? tx.query : db.query;
	const isFinalized =
		await query.SchemaSignerSetMembers.findMany({
			where: and(
				eq(
					SchemaSignerSetMembers.signerSetAddress,
					address,
				),
				eq(SchemaSignerSetMembers.isAccepted, false),
			),
		});

	return isFinalized.length === 0;
};

// Returns true if the public key is a member of the signer set and has accepted the invitation.
export const isSignerSetMember = async (
	signerSetAddress: string,
	publicKey: PublicKey,
	checkAcceptance: boolean = true,
) => {
	const whereConditions = [
		eq(
			SchemaSignerSetMembers.signerSetAddress,
			signerSetAddress,
		),
		eq(
			SchemaSignerSetMembers.publicKey,
			publicKey.toSuiPublicKey(),
		),
	];

	if (checkAcceptance) {
		whereConditions.push(
			eq(SchemaSignerSetMembers.isAccepted, true),
		);
	}

	const member =
		await db.query.SchemaSignerSetMembers.findFirst({
			where: and(...whereConditions),
		});
	return !!member;
};

// A convenient checker to see if ANY of the JWT addresses from the header
// have acess to the requested signer set.
export const jwtHasSignerSetMemberAccess = async (
	signerSetAddress: string,
	publicKeys: PublicKey[],
	checkAcceptance: boolean = true,
) => {
	const whereConditions = [
		eq(
			SchemaSignerSetMembers.signerSetAddress,
			signerSetAddress,
		),
		inArray(
			SchemaSignerSetMembers.publicKey,
			publicKeys.map((key) => key.toSuiPublicKey()),
		),
	];

	if (checkAcceptance) {
		whereConditions.push(
			eq(SchemaSignerSetMembers.isAccepted, true),
		);
	}

	const member =
		await db.query.SchemaSignerSetMembers.findFirst({
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
				eq(SchemaProposals.accountAddress, multisigAddress),
				eq(SchemaProposals.status, ProposalStatus.PENDING),
				eq(SchemaProposals.network, network),
			),
		},
	);
	return proposals;
};

// Extracts all the owned or receiving objects from a supplied transaction.
export const extractOwnedObjects = (tx: Transaction) => {
	const { inputs, gasData } = tx.getData();
	return [
		...inputs.flatMap((input) =>
			input.$kind !== 'Object'
				? []
				: input.Object.$kind === 'ImmOrOwnedObject'
					? [input.Object.ImmOrOwnedObject.objectId]
					: input.Object.$kind === 'Receiving'
						? [input.Object.Receiving.objectId]
						: [],
		),
		...(gasData?.payment?.map((x) => x.objectId) || []),
	];
};

// Validates a proposed transaction.
export const validateProposedTransaction = async (
	proposedTransaction: Transaction,
	multisigAddress: string,
	network: SuiNetwork,
) => {
	// Get the list of pending proposals.
	const pendingProposals = await getPendingProposals(
		multisigAddress,
		network,
	);

	if (pendingProposals.length >= 10) {
		throw new ValidationError(
			'You cannot have more than 10 pending proposals at the same time. Please cancel or execute some proposals before proceeding.',
		);
	}

	//   Fail early on duplicats, avoid doing RPC calls.
	const digest = await proposedTransaction.getDigest();
	if (pendingProposals.some((p) => p.digest === digest)) {
		throw new ValidationError(
			'A proposal with the same digest already exists.',
		);
	}

	if (
		proposedTransaction.getData().sender !== multisigAddress
	) {
		throw new ValidationError(
			'The transaction sender does not match the multisig address.',
		);
	}

	// Get all the owned or receiving objects from the pending proposals.
	// Make sure we do not have any of these in our proposal.
	const ownedOrReceivingObjects: string[] = [];
	for (const proposal of pendingProposals) {
		const tx = Transaction.from(proposal.transactionBytes);
		ownedOrReceivingObjects.push(
			...extractOwnedObjects(tx),
		);
	}

	//   Query all the owned objects.
	const allOwnedObjects = await queryAllOwnedObjects(
		ownedOrReceivingObjects,
		network,
	);

	// Get all the owned or receiving objects from the proposed transaction.
	const existingProposalObjects = extractOwnedObjects(
		proposedTransaction,
	);
	const allUsedOwnedObjects = [];

	for (const obj of allOwnedObjects) {
		if (existingProposalObjects.includes(obj.objectId)) {
			allUsedOwnedObjects.push(obj);
		}
	}

	if (allUsedOwnedObjects.length > 0) {
		throw new ValidationError(
			'You cannot have re-use any owned or receiving objects that are already in pending proposals. The used objects are: ' +
				allUsedOwnedObjects
					.map((obj) => obj.objectId)
					.join(', '),
		);
	}
};
