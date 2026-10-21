// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Proposal flows. Like the signer set flows, they take plain input and the
 * caller's keys, throw the errors in `../errors`, and return domain objects
 * (rows, or composites like `ProposalTally`).
 */

import { PersonalMessages } from '@mysten/sagat-legacy';
import { TransactionError } from '@mysten/sui/client';
import { type PublicKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import {
	fromBase64,
	isValidTransactionDigest,
} from '@mysten/sui/utils';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';

import { db } from '../db';
import { validateNetwork } from '../db/env';
import {
	ProposalStatus,
	proposalStatusFromString,
	SchemaProposals,
	SchemaProposalSignatures,
	type AccountSignerSet,
	type Proposal,
	type ProposalWithSignatures,
	type SignerSetWithMembers,
} from '../db/schema';
import {
	ApiAuthError,
	CommonError,
	NotFoundError,
	ValidationError,
} from '../errors';
import { AccountProposersDataLoader } from '../loaders/account-proposers.loader';
import { ProposalByDigestLoader } from '../loaders/proposals.loader';
import {
	MultisigEventType,
	multisigProposalEvents,
} from '../metrics';
import {
	getSuiClient,
	type SuiNetwork,
} from '../utils/client';
import {
	paginateResponse,
	type PaginatedResponse,
	type PaginationCursor,
} from '../utils/pagination';
import { getPublicKeyFromSerializedSignature } from '../utils/pubKey';
import { loadActiveSignerSets } from './accounts.service';
import {
	isSignerSetMember,
	jwtHasSignerSetMemberAccess,
} from './membership.service';
import {
	getSignerSet,
	validateProposedTransaction,
} from './multisig.service';
import {
	verifyMemberSignedMessage,
	verifyTransactionSignature,
} from './signatures.service';

// A proposal with the signer set of its account and how far its signatures
// get it.
export type ProposalTally = {
	proposal: ProposalWithSignatures;
	signerSet: SignerSetWithMembers;
	// Sum of the weights of the members that signed.
	currentWeight: number;
	hasReachedThreshold: boolean;
};

const tallyProposal = (
	proposal: ProposalWithSignatures,
	signerSet: SignerSetWithMembers,
): ProposalTally => {
	const currentWeight = proposal.signatures.reduce(
		(acc, sig) =>
			acc +
			(signerSet.members.find(
				(member) => member.publicKey === sig.publicKey,
			)?.weight ?? 0),
		0,
	);
	return {
		proposal,
		signerSet,
		currentWeight,
		hasReachedThreshold:
			currentWeight >= signerSet.threshold,
	};
};

// Get a proposal by id, and its signatures.
export const getProposalById = async (
	proposalId: number,
): Promise<ProposalWithSignatures> => {
	const result = await db
		.select()
		.from(SchemaProposals)
		.leftJoin(
			SchemaProposalSignatures,
			eq(
				SchemaProposals.id,
				SchemaProposalSignatures.proposalId,
			),
		)
		.where(eq(SchemaProposals.id, proposalId));

	if (!result || result.length === 0)
		throw new ValidationError('Proposal not found');

	const proposal = result[0].proposals;
	const signatures = result
		.filter((row) => row.proposal_signatures !== null)
		.map((row) => row.proposal_signatures)
		.filter((x) => !!x);

	return {
		...proposal,
		signatures: signatures.map((s) => ({
			publicKey: s.publicKey,
			signature: s.signature,
			proposalId: s.proposalId,
		})),
	};
};

const getProposalsByAccountAddress = async (
	multisigAddress: string,
	network: string,
	cursor: PaginationCursor,
	status?: ProposalStatus,
) => {
	// the next cursor.
	const nextCursor =
		cursor?.nextCursor && !isNaN(Number(cursor.nextCursor))
			? Number(cursor.nextCursor)
			: undefined;

	// Get the list of proposals.
	const proposals = await db.query.SchemaProposals.findMany(
		{
			where: and(
				eq(SchemaProposals.accountAddress, multisigAddress),
				status !== undefined
					? eq(SchemaProposals.status, status)
					: undefined,
				eq(SchemaProposals.network, network),
				nextCursor
					? lt(SchemaProposals.id, nextCursor)
					: undefined,
			),
			limit: cursor?.perPage + 1,
			orderBy: [desc(SchemaProposals.id)],
		},
	);
	// If we have more results than our page size, we have a next page.
	const hasNextPage = proposals.length > cursor.perPage;

	const page = proposals.slice(0, cursor.perPage);

	// Get the list of signatures for each one of those.
	const signatures =
		await db.query.SchemaProposalSignatures.findMany({
			where: inArray(
				SchemaProposalSignatures.proposalId,
				proposals.map((p) => p.id),
			),
		});

	const result: ProposalWithSignatures[] = [];

	for (const proposal of page) {
		const signaturesForProposal = signatures.filter(
			(s) => s.proposalId === proposal.id,
		);
		result.push({
			...proposal,
			signatures: signaturesForProposal,
		});
	}

	const nextPageCursor =
		result.length > 0
			? result[result.length - 1]?.id
			: undefined;

	return paginateResponse(
		result,
		cursor.perPage,
		hasNextPage,
		nextPageCursor?.toString(),
	);
};

/**
 * Checks a pending proposal on-chain once it has enough signatures, and
 * records whether it succeeded. Returns the proposal's status afterwards;
 * a proposal that is no longer pending is returned as is.
 */
const lookupAndVerifyProposal = async (
	proposal: ProposalWithSignatures,
): Promise<ProposalStatus> => {
	if (proposal.status !== ProposalStatus.PENDING)
		return proposal.status;

	const multisig = await getSignerSet(
		proposal.accountAddress,
	);

	if (
		!tallyProposal(proposal, multisig).hasReachedThreshold
	)
		throw new ValidationError(
			'Proposal is not ready to execute',
		);

	const tx = await getSuiClient(
		proposal.network as SuiNetwork,
	)
		.getTransaction({
			digest: proposal.digest,
			include: {
				effects: true,
			},
		})
		.catch((error) => {
			// TODO: a transaction that isn't on-chain may also never be able to
			// run, e.g. when one of its owned inputs was spent elsewhere. Such a
			// proposal stays pending and blocks new proposals that use the same
			// objects. Detect it (an input's version changed or it was deleted)
			// and move the proposal to a new terminal status for it (not
			// FAILURE, which means the transaction failed on-chain).
			if (
				error instanceof TransactionError &&
				error.reason === 'notFound'
			)
				throw new ValidationError(
					'The transaction has not been executed yet.',
				);
			throw error;
		});

	const isSuccess =
		tx.$kind !== 'FailedTransaction' &&
		!!tx.Transaction.effects.status.success;
	const status = isSuccess
		? ProposalStatus.SUCCESS
		: ProposalStatus.FAILURE;

	await db
		.update(SchemaProposals)
		.set({ status })
		.where(eq(SchemaProposals.id, proposal.id));

	multisigProposalEvents.inc({
		network: proposal.network,
		event_type: isSuccess
			? MultisigEventType.PROPOSAL_SUCCESS
			: MultisigEventType.PROPOSAL_FAILURE,
	});

	return status;
};

export type CreateProposalInput = {
	multisigAddress: string;
	transactionBytes: string;
	// The proposer's signature over the transaction.
	signature: string;
	description?: string | null;
	network: string;
};

/**
 * Creates a proposal, signed by an accepted member or an external proposer
 * of the account. A member's signature counts as its first vote.
 */
export const createProposal = async ({
	multisigAddress,
	transactionBytes,
	signature,
	description,
	network: rawNetwork,
}: CreateProposalInput): Promise<Proposal> => {
	const network = validateNetwork(rawNetwork);

	// Get the public key out of the sui signature.
	const pubKey =
		getPublicKeyFromSerializedSignature(signature);
	const multisig = await getSignerSet(multisigAddress);

	const isMember = multisig.members.some(
		(member) =>
			member.publicKey === pubKey.toSuiPublicKey() &&
			member.isAccepted,
	);
	const proposers =
		await AccountProposersDataLoader.load(multisigAddress);
	const isProposer = proposers.some(
		(proposer) =>
			proposer.address === pubKey.toSuiAddress(),
	);

	if (!isMember && !isProposer)
		throw new ApiAuthError('NotAMultisigMember');

	const proposedTransaction = Transaction.from(
		transactionBytes,
	);

	// We do not currently allow unresolved txs, and resolving one would need
	// RPC calls.
	if (!proposedTransaction.isFullyResolved())
		throw new ValidationError(
			'The transaction is not fully resolved.',
		);

	// Verify the supplied user signature before doing any RPC work for the
	// request. A fully resolved transaction builds without a client.
	const built = await proposedTransaction.build();
	await verifyTransactionSignature(
		pubKey,
		built,
		signature,
	);

	// Validate the proposed transaction for:
	// 1. No other pending proposal with the same owned objects in them.
	// 2. The transaction is not already in a pending proposal.
	await validateProposedTransaction(
		proposedTransaction,
		multisigAddress,
		network,
	);

	// Insert the proposal and the first sig!
	const proposal = await db.transaction(async (tx) => {
		const proposal = await tx
			.insert(SchemaProposals)
			.values({
				accountAddress: multisigAddress,
				digest: await proposedTransaction.getDigest(),
				transactionBytes: built.toBase64(),
				proposerAddress: pubKey.toSuiAddress(),
				description,
				network,
			})
			.returning();

		// We only save the signature if the proposer is a member.
		if (isMember) {
			await tx.insert(SchemaProposalSignatures).values({
				proposalId: proposal[0].id,
				publicKey: pubKey.toSuiPublicKey(),
				signature,
			});
			multisigProposalEvents.inc({
				network,
				event_type: MultisigEventType.SIGNATURE_ADDED,
			});
		}

		return proposal[0];
	});

	multisigProposalEvents.inc({
		network,
		event_type: MultisigEventType.PROPOSAL_CREATED,
	});

	return proposal;
};

// Adds a member's signature to a pending proposal.
export const voteOnProposal = async ({
	proposalId,
	signature,
}: {
	proposalId: number;
	// The member's signature over the proposal's transaction.
	signature: string;
}): Promise<ProposalTally> => {
	const proposal = await getProposalById(proposalId);

	const pubKey =
		getPublicKeyFromSerializedSignature(signature);

	if (
		!(await isSignerSetMember(
			proposal.accountAddress,
			pubKey,
			false,
		))
	)
		throw new ApiAuthError('NotAMultisigMember');

	if (proposal.status !== ProposalStatus.PENDING)
		throw new ValidationError('Proposal is not pending');

	if (
		proposal.signatures.some(
			(sig) => sig?.publicKey === pubKey.toSuiPublicKey(),
		)
	)
		throw new ValidationError(
			'Voter has already voted for this proposal',
		);

	await verifyTransactionSignature(
		pubKey,
		fromBase64(proposal.transactionBytes),
		signature,
	);

	const signatureObject = {
		proposalId: proposal.id,
		publicKey: pubKey.toSuiPublicKey(),
		signature,
	};

	// cast the vote in the DB.
	await db
		.insert(SchemaProposalSignatures)
		.values(signatureObject);
	proposal.signatures.push(signatureObject);

	multisigProposalEvents.inc({
		network: proposal.network,
		event_type: MultisigEventType.SIGNATURE_ADDED,
	});

	const multisig = await getSignerSet(
		proposal.accountAddress,
	);

	return tallyProposal(proposal, multisig);
};

// Cancels a pending proposal, signed by an accepted member.
// TODO: this is pretty powerful (but probably safe to do).
export const cancelProposal = async ({
	proposalId,
	signature,
}: {
	proposalId: number;
	signature: string;
}) => {
	const proposal = await getProposalById(proposalId);

	if (proposal.status !== ProposalStatus.PENDING)
		throw new ValidationError('Proposal is not pending');

	await verifyMemberSignedMessage({
		signerSetAddress: proposal.accountAddress,
		signature,
		message: PersonalMessages.cancelProposal(proposalId),
		acceptedOnly: true,
		notMemberError: () =>
			new ValidationError('Not a member of the multisig'),
	});

	await db
		.update(SchemaProposals)
		.set({ status: ProposalStatus.CANCELLED })
		.where(eq(SchemaProposals.id, proposal.id));

	multisigProposalEvents.inc({
		network: proposal.network,
		event_type: MultisigEventType.PROPOSAL_CANCELLED,
	});
};

// Verifies the execution of a proposal, for an accepted member.
export const verifyProposal = async ({
	proposalId,
	callerKeys,
}: {
	proposalId: number;
	callerKeys: PublicKey[];
}) => {
	const proposal = await getProposalById(proposalId);

	if (
		!(await jwtHasSignerSetMemberAccess(
			proposal.accountAddress,
			callerKeys,
		))
	)
		throw new ApiAuthError('NotAMultisigMember');

	return await lookupAndVerifyProposal(proposal);
};

// Verifies the execution of a proposal. Open to anyone: it only reads the
// chain.
export const verifyProposalByDigest = async (
	digest: string,
) => {
	const proposal =
		await ProposalByDigestLoader.load(digest);

	if (!proposal) throw new NotFoundError();

	return await lookupAndVerifyProposal(proposal);
};

// Lists an account's proposals on a network, for an accepted member.
export const listProposals = async ({
	multisigAddress,
	network,
	status,
	cursor,
	callerKeys,
}: {
	multisigAddress: string;
	network: string;
	// One of the `ProposalStatus` names. Parsed after the access check.
	status?: string;
	cursor: PaginationCursor;
	callerKeys: PublicKey[];
}): Promise<PaginatedResponse<ProposalWithSignatures>> => {
	validateNetwork(network);

	if (
		!(await jwtHasSignerSetMemberAccess(
			multisigAddress,
			callerKeys,
		))
	)
		throw new ApiAuthError('NotAMultisigMember');

	return await getProposalsByAccountAddress(
		multisigAddress,
		network,
		cursor,
		status ? proposalStatusFromString(status) : undefined,
	);
};

// A proposal by its transaction digest, with its signer set. Public.
export const getProposalByDigest = async (
	digest: string,
): Promise<ProposalTally> => {
	if (!isValidTransactionDigest(digest))
		throw new CommonError('InvalidDigest');

	const proposal =
		await ProposalByDigestLoader.load(digest);

	if (!proposal) throw new NotFoundError();

	const multisig = await getSignerSet(
		proposal.accountAddress,
	);

	return tallyProposal(proposal, multisig);
};

// One of the account's signer sets, and how far a proposal's signatures
// get it.
export type SignerSetTally = {
	link: AccountSignerSet;
	signerSet: SignerSetWithMembers;
	currentWeight: number;
	hasReachedThreshold: boolean;
};

/**
 * Tallies a proposal against each active signer set of its account. A
 * signature counts towards every set that has its key.
 */
export const tallySignerSets = async (
	proposal: ProposalWithSignatures,
): Promise<SignerSetTally[]> =>
	(await loadActiveSignerSets(proposal.accountAddress)).map(
		({ link, signerSet }) => {
			const { currentWeight, hasReachedThreshold } =
				tallyProposal(proposal, signerSet);
			return {
				link,
				signerSet,
				currentWeight,
				hasReachedThreshold,
			};
		},
	);

// Adds a member's signature, then tallies every signer set of the account.
export const voteAndTallySignerSets = async (
	input: Parameters<typeof voteOnProposal>[0],
) => {
	const { proposal } = await voteOnProposal(input);
	return {
		proposal,
		signerSets: await tallySignerSets(proposal),
	};
};

// A proposal by its transaction digest, tallied against each signer set of
// its account. Public.
export const getProposalSignerSetsByDigest = async (
	digest: string,
) => {
	if (!isValidTransactionDigest(digest))
		throw new CommonError('InvalidDigest');

	const proposal =
		await ProposalByDigestLoader.load(digest);

	if (!proposal) throw new NotFoundError();

	return {
		proposal,
		signerSets: await tallySignerSets(proposal),
	};
};
