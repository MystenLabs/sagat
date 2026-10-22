// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Signer set flows. They take plain input and the caller's keys (from the
 * JWT, or recovered from a signature), throw the errors in `../errors`, and
 * return domain objects (rows, or rows grouped with what belongs to them,
 * like `MultisigAccount`): each router maps them to its own response shapes.
 */

import { PersonalMessages } from '@mysten/sagat-legacy';
import { type PublicKey } from '@mysten/sui/cryptography';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { and, eq, inArray, type SQL } from 'drizzle-orm';

import { LIMITS } from '../constants/limits';
import { db } from '../db';
import {
	AccountSignerSetStatus,
	ProposalStatus,
	SchemaAccountKeys,
	SchemaAccountProposers,
	SchemaAccounts,
	SchemaAccountSignerSets,
	SchemaProposals,
	SchemaSignerSetMembers,
	SchemaSignerSets,
	type SignerSet,
	type SignerSetMember,
	type SignerSetOrigin,
	type SignerSetWithMembers,
} from '../db/schema';
import {
	ApiAuthError,
	CommonError,
	NotFoundError,
	ValidationError,
} from '../errors';
import {
	AccountKeyLabelsDataLoader,
	type KeyLabels,
} from '../loaders/account-keys.loader';
import {
	AccountProposersDataLoader,
	type Proposer,
} from '../loaders/account-proposers.loader';
import { SignerSetDataLoader } from '../loaders/signer-set.loader';
import {
	queryAllOwnedObjects,
	type SuiNetwork,
} from '../utils/client';
import { parsePublicKey } from '../utils/pubKey';
import { normalizeKeyLabels } from './account-keys.service';
import {
	expandSignerSetsWithMembers,
	registerPublicKeyStrings,
} from './addresses.service';
import { validateExpiry } from './auth.service';
import { jwtHasSignerSetMemberAccess } from './membership.service';
import {
	verifyMemberSignedMessage,
	verifySignedMessage,
} from './signatures.service';

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

/**
 * What the legacy routes call a multisig: a signer set that is the
 * original composition of the account with the same address, with the
 * account's proposers, its labels for the keys, and who created it.
 */
export type MultisigAccount = {
	signerSet: SignerSetWithMembers;
	proposers: Proposer[];
	labels: KeyLabels;
	// Who created it and when. A signer set without it is not a multisig.
	origin: SignerSetOrigin;
};

// The multisig at `address`, for a caller holding one of its keys (accepted
// or not). A signer set without the account's link row for its original
// composition (a draft for another account) is not a multisig to legacy
// clients.
export const getMultisigAccount = async ({
	address,
	callerKeys,
}: {
	address: string;
	callerKeys: PublicKey[];
}): Promise<MultisigAccount> => {
	if (
		!(await jwtHasSignerSetMemberAccess(
			address,
			callerKeys,
			false,
		))
	)
		throw new ApiAuthError('AccessDenied');

	const [signerSet, origin, proposers, labels] =
		await Promise.all([
			SignerSetDataLoader.load(address),
			getAccountOrigin(address),
			AccountProposersDataLoader.load(address),
			AccountKeyLabelsDataLoader.load(address),
		]);
	if (!signerSet || !origin) throw new NotFoundError();
	return { signerSet, proposers, labels, origin };
};

type MultisigAccountRow = SignerSetOrigin & {
	address: string;
};

// Signer sets with a member matching `where`, with who drafted them and
// when. Legacy clients only see signer sets that have their account's link
// row for the original composition, `(A, A)` in `account_signer_sets`: a
// signer set drafted for another account would otherwise show up as a
// standalone multisig.
const selectMultisigAccounts = async (
	where: SQL | undefined,
): Promise<MultisigAccountRow[]> =>
	db
		.selectDistinct({
			address: SchemaSignerSetMembers.signerSetAddress,
			draftedBy: SchemaAccountSignerSets.draftedBy,
			createdAt: SchemaAccountSignerSets.createdAt,
		})
		.from(SchemaSignerSetMembers)
		.innerJoin(
			SchemaAccountSignerSets,
			and(
				eq(
					SchemaAccountSignerSets.accountAddress,
					SchemaSignerSetMembers.signerSetAddress,
				),
				eq(
					SchemaAccountSignerSets.signerSetAddress,
					SchemaSignerSetMembers.signerSetAddress,
				),
			),
		)
		.where(where);

// Signer sets with their account's proposers, key labels and origin.
const loadMultisigAccounts = async (
	rows: MultisigAccountRow[],
): Promise<MultisigAccount[]> => {
	const origins = new Map(
		rows.map(({ address, ...origin }) => [address, origin]),
	);
	const signerSets = await expandSignerSetsWithMembers([
		...origins.keys(),
	]);
	const accountAddresses = signerSets.map((s) => s.address);
	const [proposers, labels] = await Promise.all([
		AccountProposersDataLoader.loadMany(accountAddresses),
		AccountKeyLabelsDataLoader.loadMany(accountAddresses),
	]);
	return signerSets.map((signerSet, i) => {
		const accountProposers = proposers[i];
		if (accountProposers instanceof Error)
			throw accountProposers;
		const keyLabels = labels[i];
		if (keyLabels instanceof Error) throw keyLabels;
		// Each signer set was loaded from a row, so it has one.
		const origin = origins.get(signerSet.address);
		if (!origin)
			throw new Error(
				`No origin for signer set ${signerSet.address}`,
			);
		return {
			signerSet,
			proposers: accountProposers,
			labels: keyLabels,
			origin,
		};
	});
};

/**
 * The multisigs each of the caller's keys has accepted, by public key, in
 * the order of `callerKeys`.
 */
export const listConnections = async ({
	callerKeys,
}: {
	callerKeys: PublicKey[];
}): Promise<Map<string, MultisigAccount[]>> => {
	const whereConditions = [
		inArray(
			SchemaSignerSetMembers.publicKey,
			callerKeys.map((pubKey) => pubKey.toSuiPublicKey()),
		),
		eq(SchemaSignerSetMembers.isAccepted, true),
		eq(SchemaSignerSetMembers.isRejected, false),
	];

	// Step 1: Find multisigs that the given publicKeys belong to
	const rows = await selectMultisigAccounts(
		and(...whereConditions),
	);

	// Step 2: Expand multisigs to full objects with all members
	const multisigs = await loadMultisigAccounts(rows);

	const grouped = new Map<string, MultisigAccount[]>();

	for (const pubkey of callerKeys) {
		const pubKeyBase64 = pubkey.toSuiPublicKey();
		// shouldnt really happen
		if (grouped.has(pubKeyBase64)) continue;

		// Only include accepted multisigs for individual public keys.
		grouped.set(
			pubKeyBase64,
			multisigs.filter(({ signerSet }) =>
				signerSet.members.some(
					(m) =>
						m.publicKey === pubKeyBase64 && m.isAccepted,
				),
			),
		);
	}

	return grouped;
};

/**
 * The multisigs `publicKey` is invited to and has not answered, or with
 * `showRejected`, the ones it rejected. `publicKey` must be one of the
 * caller's keys.
 */
export const listInvitations = async ({
	publicKey,
	showRejected,
	callerKeys,
}: {
	publicKey: string;
	showRejected: boolean;
	callerKeys: PublicKey[];
}): Promise<MultisigAccount[]> => {
	if (
		!callerKeys.some(
			(pubKey) => pubKey.toSuiPublicKey() === publicKey,
		)
	)
		throw new ValidationError('You are not authorized.');

	const whereConditions = [
		eq(SchemaSignerSetMembers.publicKey, publicKey),
		showRejected
			? eq(SchemaSignerSetMembers.isRejected, true)
			: and(
					eq(SchemaSignerSetMembers.isAccepted, false),
					eq(SchemaSignerSetMembers.isRejected, false),
				),
	];

	// Step 1: Find multisigs for this public key's invitations
	const rows = await selectMultisigAccounts(
		and(...whereConditions),
	);

	// Step 2: Expand multisigs to full objects with all members
	return await loadMultisigAccounts(rows);
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

// Get a list of pending proposals for a given multisig address.
const getPendingProposals = async (
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
const extractOwnedObjects = (tx: Transaction) => {
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

export type CreateSignerSetInput = {
	publicKeys: string[];
	weights: number[];
	threshold: number;
	name?: string;
	// Optional, aligned with `publicKeys`: what this account calls each
	// key. Unvalidated until `normalizeKeyLabels`.
	labels?: unknown;
};

export type CreatedSignerSet = {
	signerSet: SignerSet;
	members: SignerSetMember[];
	// The labels that were set, by public key.
	labels: KeyLabels;
	origin: SignerSetOrigin;
};

/**
 * Creates a signer set together with the account of the same address, as
 * the account's original signer set. The caller's keys that are in the
 * composition accept right away.
 */
export const createSignerSet = async ({
	publicKeys,
	weights,
	threshold,
	name,
	labels: rawLabels,
	callerKeys,
}: CreateSignerSetInput & {
	callerKeys: PublicKey[];
}): Promise<CreatedSignerSet> => {
	// Pure checks first, before anything is written. The member count is
	// bounded before anything is sized by it.
	validateMemberCount(publicKeys);
	const labels = normalizeKeyLabels(
		rawLabels,
		publicKeys.length,
	);

	// Register all public keys first
	await registerPublicKeyStrings(publicKeys);

	// Parse all public keys and get their addresses
	const parsedPubKeys: PublicKey[] = [];
	const addresses: string[] = [];

	for (const pubKeyStr of publicKeys) {
		const parsedKey = parsePublicKey(pubKeyStr);
		const address = parsedKey.toSuiAddress();

		parsedPubKeys.push(parsedKey);
		addresses.push(address);
	}

	// Validate the quorum with computed addresses
	await validateQuorum(addresses, weights, threshold);

	// Anyone holding a key may set up a multisig for others, but only a
	// member may name its keys: labels are shown to every member and there
	// is no route to change them, so an outsider must not get to write them.
	const callerIsMember = callerKeys.some((k) =>
		addresses.includes(k.toSuiAddress()),
	);
	if (!callerIsMember && labels.some((l) => l !== null))
		throw new ValidationError(
			'Only a member of the multisig can label its keys.',
		);

	const multisig = MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: parsedPubKeys.map((key, index) => ({
			publicKey: key,
			weight: weights[index],
		})),
	});

	// add the multisig to the database.
	return await db.transaction(async (tx) => {
		const msig = (
			await tx
				.insert(SchemaSignerSets)
				.values({
					address: multisig.toSuiAddress(),
					isVerified: false,
					threshold,
					name,
				})
				.returning()
		)[0];

		// A legacy multisig is also an account with the same address, so the
		// `/v1` API sees what the legacy routes created.
		await tx
			.insert(SchemaAccounts)
			.values({ address: msig.address, name })
			.onConflictDoNothing();

		// The multisig is the account's original signer set. The creator is
		// the first authenticated key in the composition, else the first
		// authenticated key.
		const creator =
			callerKeys.find((k) =>
				addresses.includes(k.toSuiAddress()),
			) ?? callerKeys[0];
		const [origin] = await tx
			.insert(SchemaAccountSignerSets)
			.values({
				accountAddress: msig.address,
				signerSetAddress: msig.address,
				label: name,
				status: AccountSignerSetStatus.INVITING,
				draftedBy: creator.toSuiAddress(),
			})
			.returning({
				draftedBy: SchemaAccountSignerSets.draftedBy,
				createdAt: SchemaAccountSignerSets.createdAt,
			});

		// insert the multisig members in the DB.
		const members = await tx
			.insert(SchemaSignerSetMembers)
			.values(
				parsedPubKeys.map((key, index) => ({
					signerSetAddress: msig.address,
					publicKey: key.toSuiPublicKey(),
					weight:
						weights[
							addresses.findIndex(
								(addr) => addr === key.toSuiAddress(),
							)
						],
					// If authorization includes the user, we can accept immediately.
					isAccepted: callerKeys.some(
						(k) => k.toSuiAddress() === key.toSuiAddress(),
					),
					order: index,
				})),
			)
			.returning();

		// The account's names for its keys. Only labelled keys get a row.
		const keyLabels = new Map<string, string>();
		parsedPubKeys.forEach((key, index) => {
			const label = labels[index];
			if (label !== null)
				keyLabels.set(key.toSuiPublicKey(), label);
		});
		if (keyLabels.size > 0)
			await tx.insert(SchemaAccountKeys).values(
				[...keyLabels].map(([publicKey, label]) => ({
					accountAddress: msig.address,
					publicKey,
					label,
					updatedBy: creator.toSuiAddress(),
				})),
			);

		return {
			signerSet: msig,
			members,
			labels: keyLabels,
			origin,
		};
	});
};

/**
 * Accepts an invitation to a signer set, signed by the invited key. Once
 * every member has accepted, the signer set is verified. Returns the signer
 * set as it is after the change, and who created it.
 */
export const acceptInvitation = async ({
	address,
	signature,
}: {
	address: string;
	signature: string;
}): Promise<{
	signerSet: SignerSet;
	origin: SignerSetOrigin | null;
}> => {
	const pubKey = await verifyMemberSignedMessage({
		signerSetAddress: address,
		signature,
		message:
			PersonalMessages.acceptMultisigInvitation(address),
		acceptedOnly: false,
		notMemberError: () =>
			new ValidationError(
				'You are not a member of this multisig',
			),
	});

	// The origin never changes after insert, so it is read outside the
	// transaction.
	const [existingConnections, origin] = await Promise.all([
		db.query.SchemaSignerSetMembers.findMany({
			where: and(
				eq(
					SchemaSignerSetMembers.publicKey,
					pubKey.toSuiPublicKey(),
				),
				eq(SchemaSignerSetMembers.isAccepted, true),
			),
		}),
		getAccountOrigin(address),
	]);

	// Maximum connections per public key.
	if (
		existingConnections.length >
		LIMITS.maxMultisigsPerPublicKey
	)
		throw new ValidationError(
			'You have reached the maximum number of multisigs for this public key',
		);

	return await db.transaction(async (tx) => {
		const msig = await tx.query.SchemaSignerSets.findFirst({
			where: eq(SchemaSignerSets.address, address),
		});

		if (!msig)
			throw new ValidationError('Multisig not found');

		await tx
			.update(SchemaSignerSetMembers)
			.set({ isAccepted: true, isRejected: false })
			.where(
				and(
					eq(
						SchemaSignerSetMembers.signerSetAddress,
						address,
					),
					eq(
						SchemaSignerSetMembers.publicKey,
						pubKey.toSuiPublicKey(),
					),
				),
			);

		const isFinalized = await isSignerSetFinalized(
			address,
			tx,
		);
		// if all members have accepted, we can finalize the multisig.
		if (isFinalized) {
			await tx
				.update(SchemaSignerSets)
				.set({ isVerified: true })
				.where(eq(SchemaSignerSets.address, address));
			// Verification is a property of the composition, so every
			// account linked to it sees the set as verified.
			await tx
				.update(SchemaAccountSignerSets)
				.set({ status: AccountSignerSetStatus.VERIFIED })
				.where(
					and(
						eq(
							SchemaAccountSignerSets.signerSetAddress,
							address,
						),
						inArray(SchemaAccountSignerSets.status, [
							AccountSignerSetStatus.DRAFT,
							AccountSignerSetStatus.INVITING,
						]),
					),
				);
		}
		msig.isVerified = isFinalized;
		return { signerSet: msig, origin };
	});
};

// Rejects an invitation to a signer set, signed by the invited key.
export const rejectInvitation = async ({
	address,
	signature,
}: {
	address: string;
	signature: string;
}) => {
	// Validate signature with rejection-specific message
	const pubKey = await verifySignedMessage(
		signature,
		PersonalMessages.rejectMultisigInvitation(address),
	);

	const multisig = await getSignerSet(address);

	if (multisig.isVerified)
		throw new ValidationError(
			'Multisig is already verified',
		);

	const member = multisig.members.find(
		(x) => x?.publicKey == pubKey.toSuiPublicKey(),
	);
	if (!member)
		throw new ValidationError(
			'You are not a member of this multisig',
		);

	if (member.isAccepted)
		throw new ValidationError(
			'Cannot reject after accepting',
		);

	if (member.isRejected)
		throw new ValidationError(
			'This invitation has already been rejected',
		);

	await db
		.update(SchemaSignerSetMembers)
		.set({ isRejected: true })
		.where(
			and(
				eq(
					SchemaSignerSetMembers.signerSetAddress,
					address,
				),
				eq(
					SchemaSignerSetMembers.publicKey,
					pubKey.toSuiPublicKey(),
				),
			),
		);
};

type ProposerChange = {
	// The account (multisig) address.
	address: string;
	proposer: string;
	signature: string;
	expiry: string;
};

// Adds an external proposer to an account, signed by an accepted member.
export const addProposer = async ({
	address,
	proposer,
	signature,
	expiry,
}: ProposerChange) => {
	// Validate the expiry time of the signature.
	validateExpiry(expiry);

	if (!isValidSuiAddress(proposer))
		throw new CommonError('InvalidAddress');

	const publicKey = await verifyMemberSignedMessage({
		signerSetAddress: address,
		signature,
		message: PersonalMessages.addMultisigProposer(
			proposer,
			address,
			expiry,
		),
		acceptedOnly: true,
		notMemberError: () =>
			new ApiAuthError('NotAMultisigMember'),
	});

	// Add the proposer to the multisig.
	await db.transaction(
		async (tx) => {
			const existingProposers =
				await tx.query.SchemaAccountProposers.findMany({
					columns: { address: true },
					where: and(
						eq(
							SchemaAccountProposers.accountAddress,
							address,
						),
					),
				});

			if (
				existingProposers.length >=
				LIMITS.maxProposersPerMultisig
			)
				throw new ValidationError(
					'You have reached the maximum number of proposers for this multisig',
				);

			if (
				existingProposers.some(
					(p) => p.address === proposer,
				)
			)
				throw new ValidationError(
					`${proposer} is already a proposer for this multisig`,
				);

			await tx.insert(SchemaAccountProposers).values({
				accountAddress: address,
				address: proposer,
				addedBy: publicKey.toSuiAddress(),
			});
		},
		{ isolationLevel: 'repeatable read' },
	);
};

// Removes an external proposer from an account, signed by an accepted
// member. The proposer's pending proposals are cancelled.
export const removeProposer = async ({
	address,
	proposer,
	signature,
	expiry,
}: ProposerChange) => {
	// Validate the expiry time of the signature.
	validateExpiry(expiry);

	if (!isValidSuiAddress(proposer))
		throw new CommonError('InvalidAddress');

	await verifyMemberSignedMessage({
		signerSetAddress: address,
		signature,
		message: PersonalMessages.removeMultisigProposer(
			proposer,
			address,
			expiry,
		),
		acceptedOnly: true,
		notMemberError: () =>
			new ApiAuthError('NotAMultisigMember'),
	});

	// Remove the proposer from the multisig, removing all pending transactions from the proposer.
	await db.transaction(async (tx) => {
		// Cancel all pending transactions from the proposer.
		await tx
			.update(SchemaProposals)
			.set({ status: ProposalStatus.CANCELLED })
			.where(
				and(
					eq(SchemaProposals.accountAddress, address),
					eq(SchemaProposals.proposerAddress, proposer),
					eq(
						SchemaProposals.status,
						ProposalStatus.PENDING,
					),
				),
			);

		await tx
			.delete(SchemaAccountProposers)
			.where(
				and(
					eq(
						SchemaAccountProposers.accountAddress,
						address,
					),
					eq(SchemaAccountProposers.address, proposer),
				),
			);
	});
};
