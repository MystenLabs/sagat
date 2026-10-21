// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Proposal flows. Like the signer set flows, they take plain input and the
 * caller's keys, throw the errors in `../errors`, and return domain objects
 * (rows, or composites like `ProposalTally`).
 */

import { TransactionError } from '@mysten/sui/client';
import { type PublicKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import {
	fromBase64,
	isValidTransactionDigest,
} from '@mysten/sui/utils';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';

import { LegacyMessages } from '../constants/messages';
import { db } from '../db';
import { validateNetwork } from '../db/env';
import {
	ProposalStatus,
	proposalStatusFromString,
	SchemaProposals,
	SchemaProposalSignatures,
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
import { senderSignerAddress } from '../utils/signer';
import { selectAccounts } from './accounts.service';
import { validateProposedTransaction } from './multisig.service';
import {
	verifyMemberSignedMessage,
	verifyTransactionSignature,
} from './signatures.service';
import {
	hasMember,
	isAcceptedMember,
	signerSetsInScope,
	validSignerSets,
	type ScopedSignerSet,
	type SignerSetScope,
	type ValidatedSignerSet,
} from './validity.service';

// How far a proposal's signatures get a signer set.
type Progress = {
	// Sum of the weights of the members that signed.
	currentWeight: number;
	hasReachedThreshold: boolean;
};

const progress = (
	proposal: ProposalWithSignatures,
	signerSet: SignerSetWithMembers,
): Progress => {
	const currentWeight = proposal.signatures.reduce(
		(acc, sig) =>
			acc +
			(signerSet.members.find(
				(member) => member.publicKey === sig.publicKey,
			)?.weight ?? 0),
		0,
	);
	return {
		currentWeight,
		hasReachedThreshold:
			currentWeight >= signerSet.threshold,
	};
};

// Tallies a proposal against each of `signerSets`. A signature counts
// towards every set that has its key; one from a key in none of them is
// kept but counts nowhere.
const tallyEach = <S extends ScopedSignerSet>(
	proposal: ProposalWithSignatures,
	signerSets: S[],
): (S & Progress)[] =>
	signerSets.map((s) => ({
		...s,
		...progress(proposal, s.signerSet),
	}));

// A proposal with the original composition of its account and how far its
// signatures get it, for the legacy routes.
type ProposalTally = {
	proposal: ProposalWithSignatures;
} & ScopedSignerSet &
	Progress;

// The legacy tally: the first (and only) entry of the original scope.
// Throws `NotFoundError` when the account has no original composition.
const originalTally = (
	proposal: ProposalWithSignatures,
	signerSets: ScopedSignerSet[],
): ProposalTally => {
	const [tally] = tallyEach(proposal, signerSets);
	if (!tally) throw new NotFoundError();
	return { proposal, ...tally };
};

const tallyAgainstOriginal = async (
	proposal: ProposalWithSignatures,
) =>
	originalTally(
		proposal,
		await signerSetsInScope(
			proposal.accountAddress,
			undefined,
			'original',
		),
	);

// Get a proposal by id, and its signatures.
const getProposalById = async (
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
 * The legacy routes verify a pending proposal only once the original
 * composition has reached its threshold. `/v1` does not: any valid signer
 * set, or one Sagat does not know, may have executed it, and the chain
 * says which.
 */
const assertOriginalThreshold = async (
	proposal: ProposalWithSignatures,
) => {
	if (proposal.status !== ProposalStatus.PENDING) return;
	if (
		!(await tallyAgainstOriginal(proposal))
			.hasReachedThreshold
	)
		throw new ValidationError(
			'Proposal is not ready to execute',
		);
};

/**
 * Checks a pending proposal on-chain and records whether it succeeded, and
 * the address that signed it for the account (`executed_via`). Returns the
 * proposal's status afterwards; a proposal that is no longer pending is
 * returned as is.
 */
const lookupAndVerifyProposal = async (
	proposal: ProposalWithSignatures,
): Promise<ProposalStatus> => {
	if (proposal.status !== ProposalStatus.PENDING)
		return proposal.status;

	const tx = await getSuiClient(
		proposal.network as SuiNetwork,
	)
		.getTransaction({
			digest: proposal.digest,
			include: {
				effects: true,
				transaction: true,
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
	const executed = tx.Transaction ?? tx.FailedTransaction;
	const executedVia = senderSignerAddress(
		executed.signatures,
		{
			sender:
				executed.transaction.sender ??
				proposal.accountAddress,
			gasOwner:
				executed.transaction.gasData.owner ??
				proposal.accountAddress,
		},
	);

	await db
		.update(SchemaProposals)
		.set({ status, executedVia })
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
	// Who counts as a member. Defaults to the legacy check.
	signerSets?: SignerSetScope;
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
	signerSets: scope = 'original',
}: CreateProposalInput): Promise<Proposal> => {
	const network = validateNetwork(rawNetwork);

	// Get the public key out of the sui signature.
	const pubKey =
		getPublicKeyFromSerializedSignature(signature);
	const [signerSets, proposers, accounts] =
		await Promise.all([
			signerSetsInScope(multisigAddress, network, scope),
			AccountProposersDataLoader.load(multisigAddress),
			// `/v1` knows an account by its row, the legacy routes by its
			// original composition.
			scope === 'valid'
				? selectAccounts([multisigAddress])
				: undefined,
		]);
	if (
		accounts
			? accounts.length === 0
			: signerSets.length === 0
	)
		throw new NotFoundError();

	const isMember = hasMember(signerSets, [pubKey], {
		acceptedOnly: true,
	});
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

type VoteInput = {
	proposalId: number;
	// The member's signature over the proposal's transaction.
	signature: string;
};

// Adds a member's signature to a pending proposal, and returns the
// proposal with it. `isVoter` decides who is a member.
const castVote = async (
	{ proposalId, signature }: VoteInput,
	isVoter: (
		proposal: ProposalWithSignatures,
		pubKey: PublicKey,
	) => Promise<boolean>,
): Promise<ProposalWithSignatures> => {
	const proposal = await getProposalById(proposalId);

	const pubKey =
		getPublicKeyFromSerializedSignature(signature);

	if (!(await isVoter(proposal, pubKey)))
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

	return proposal;
};

/**
 * Adds a signature from a member (accepted or not) of a signer set in
 * scope, and tallies the proposal against those sets. Acceptance is
 * Sagat's bookkeeping: the chain counts every key of the set. Under `/v1`
 * the sets are those valid on the proposal's network, so a key valid only
 * on another network is refused.
 */
const voteInScope = async (
	input: VoteInput,
	scope: SignerSetScope,
) => {
	let signerSets: ScopedSignerSet[] = [];
	const proposal = await castVote(
		input,
		async (p, pubKey) => {
			signerSets = await signerSetsInScope(
				p.accountAddress,
				p.network as SuiNetwork,
				scope,
			);
			return hasMember(signerSets, [pubKey], {
				acceptedOnly: false,
			});
		},
	);
	return { proposal, signerSets };
};

// Adds a signature from a member of the original composition and tallies
// it. For the legacy routes.
export const voteOnProposal = async (
	input: VoteInput,
): Promise<ProposalTally> => {
	const { proposal, signerSets } = await voteInScope(
		input,
		'original',
	);
	return originalTally(proposal, signerSets);
};

// Adds a signature from a member of a signer set valid on the proposal's
// network, and tallies each of those sets.
export const voteAndTallySignerSets = async (
	input: VoteInput,
) => {
	const { proposal, signerSets } = await voteInScope(
		input,
		'valid',
	);
	return tallyEach(proposal, signerSets);
};

// Cancels a pending proposal, signed by an accepted member of a signer set
// in scope (under `/v1`, valid on the proposal's network).
// TODO: this is pretty powerful (but probably safe to do).
export const cancelProposal = async ({
	proposalId,
	signature,
	signerSets: scope = 'original',
}: {
	proposalId: number;
	signature: string;
	signerSets?: SignerSetScope;
}) => {
	const proposal = await getProposalById(proposalId);

	if (proposal.status !== ProposalStatus.PENDING)
		throw new ValidationError('Proposal is not pending');

	await verifyMemberSignedMessage({
		signature,
		message: LegacyMessages.cancelProposal(proposalId),
		isMember: (signer) =>
			isAcceptedMember(
				proposal.accountAddress,
				proposal.network as SuiNetwork,
				scope,
				[signer],
			),
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

type VerifyInput = {
	proposalId: number;
	callerKeys: PublicKey[];
};

// The proposal, for a caller holding an accepted key in a signer set in
// scope. Verifying only reads the chain, so it is not tied to the
// proposal's network: under `/v1` a set valid on any network will do.
const getProposalForMember = async (
	{ proposalId, callerKeys }: VerifyInput,
	scope: SignerSetScope,
) => {
	const proposal = await getProposalById(proposalId);
	if (
		!(await isAcceptedMember(
			proposal.accountAddress,
			undefined,
			scope,
			callerKeys,
		))
	)
		throw new ApiAuthError('NotAMultisigMember');
	return proposal;
};

// A proposal by its transaction digest, or `NotFoundError`.
const loadProposalByDigest = async (digest: string) => {
	const proposal =
		await ProposalByDigestLoader.load(digest);
	if (!proposal) throw new NotFoundError();
	return proposal;
};

// Verifies the execution of a proposal, for an accepted member of the
// original composition. For the legacy routes.
export const verifyProposal = async (
	input: VerifyInput,
) => {
	const proposal = await getProposalForMember(
		input,
		'original',
	);
	await assertOriginalThreshold(proposal);
	return await lookupAndVerifyProposal(proposal);
};

// Verifies the execution of a proposal, for an accepted member of a signer
// set of the account valid on any network.
export const verifyAccountProposal = async (
	input: VerifyInput,
) =>
	await lookupAndVerifyProposal(
		await getProposalForMember(input, 'valid'),
	);

// Verifies the execution of a proposal. Open to anyone: it only reads the
// chain. For the legacy routes.
export const verifyProposalByDigest = async (
	digest: string,
) => {
	const proposal = await loadProposalByDigest(digest);
	await assertOriginalThreshold(proposal);
	return await lookupAndVerifyProposal(proposal);
};

// Verifies the execution of a proposal. Open to anyone.
export const verifyAccountProposalByDigest = async (
	digest: string,
) =>
	await lookupAndVerifyProposal(
		await loadProposalByDigest(digest),
	);

type ListProposalsInput = {
	multisigAddress: string;
	network: string;
	// One of the `ProposalStatus` names. Parsed after the access check.
	status?: string;
	cursor: PaginationCursor;
	callerKeys: PublicKey[];
};

// Lists an account's proposals on a network, for an accepted member of the
// original composition. For the legacy routes.
export const listProposals = async ({
	multisigAddress,
	network,
	status,
	cursor,
	callerKeys,
}: ListProposalsInput): Promise<
	PaginatedResponse<ProposalWithSignatures>
> => {
	validateNetwork(network);

	if (
		!(await isAcceptedMember(
			multisigAddress,
			undefined,
			'original',
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

// One of the account's signer sets, and how far a proposal's signatures
// get it.
export type SignerSetTally = ValidatedSignerSet & Progress;

// A proposal, tallied against each signer set of its account valid on the
// proposal's network.
export type ProposalWithTallies = {
	proposal: ProposalWithSignatures;
	signerSets: SignerSetTally[];
};

/**
 * Lists an account's proposals on a network, each tallied against the
 * signer sets valid there, for an accepted member of one of them. Every
 * proposal of the page shares the account and network, so the valid sets
 * are resolved once.
 */
export const listProposalsWithSignerSets = async ({
	multisigAddress,
	network,
	status,
	cursor,
	callerKeys,
}: ListProposalsInput): Promise<
	PaginatedResponse<ProposalWithTallies>
> => {
	const validNetwork = validateNetwork(network);

	const signerSets = await validSignerSets(
		multisigAddress,
		validNetwork,
	);
	if (
		!hasMember(signerSets, callerKeys, {
			acceptedOnly: true,
		})
	)
		throw new ApiAuthError('NotAMultisigMember');

	const page = await getProposalsByAccountAddress(
		multisigAddress,
		network,
		cursor,
		status ? proposalStatusFromString(status) : undefined,
	);
	return {
		...page,
		data: page.data.map((proposal) => ({
			proposal,
			signerSets: tallyEach(proposal, signerSets),
		})),
	};
};

// A proposal by its transaction digest, with the original composition of
// its account. Public. For the legacy routes.
export const getProposalByDigest = async (
	digest: string,
): Promise<ProposalTally> => {
	if (!isValidTransactionDigest(digest))
		throw new CommonError('InvalidDigest');

	return await tallyAgainstOriginal(
		await loadProposalByDigest(digest),
	);
};

// A proposal by its transaction digest, tallied against each signer set of
// its account valid on the proposal's network. Public. The `/v1` route
// validates the digest.
export const getProposalSignerSetsByDigest = async (
	digest: string,
): Promise<ProposalWithTallies> => {
	const proposal = await loadProposalByDigest(digest);
	return {
		proposal,
		signerSets: tallyEach(
			proposal,
			await validSignerSets(
				proposal.accountAddress,
				proposal.network as SuiNetwork,
			),
		),
	};
};
