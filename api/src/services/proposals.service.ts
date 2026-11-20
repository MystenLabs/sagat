// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Proposal flows. Like the signer set flows, they take plain input and the
 * caller's keys, throw the errors in `../errors`, and return domain objects
 * (rows, or composites like `ProposalProgress`).
 */

import { PersonalMessages } from '@mysten/sagat';
import { TransactionError } from '@mysten/sui/client';
import { type PublicKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import {
	fromBase64,
	isValidSuiAddress,
	isValidTransactionDigest,
} from '@mysten/sui/utils';
import {
	and,
	desc,
	eq,
	inArray,
	lt,
	notExists,
} from 'drizzle-orm';

import { LIMITS } from '../constants/limits';
import { db } from '../db';
import { validateNetwork } from '../db/env';
import {
	MAX_PROPOSAL_DESCRIPTION_LENGTH,
	ProposalStatus,
	proposalStatusFromString,
	SchemaAccountProposers,
	SchemaProposals,
	SchemaProposalSignatures,
	type Proposal,
	type ProposalWithSignatures,
} from '../db/schema';
import {
	lockAccount,
	type DatabaseTransaction,
} from '../db/transaction';
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
	wholeNumberUpTo,
	type PaginatedResponse,
	type PaginationCursor,
} from '../utils/pagination';
import { getPublicKeyFromSerializedSignature } from '../utils/pubKey';
import { normalizeText } from '../utils/text';
import {
	getProposalEvents,
	recordAccountEvent,
	type ProposalEvents,
} from './account-events.service';
import { isAccountSigner } from './membership.service';
import {
	getExclusiveObjects,
	validateProposedTransaction,
} from './multisig.service';
import {
	assertCanonicalSignature,
	verifySignedMessage,
	verifyTransactionSignature,
} from './signatures.service';
import {
	actingSetsOn,
	countSignatures,
	keyAnswer,
	ORIGINAL_SET,
	resolveAccountSigners,
	type AccountSigners,
	type SignerScope,
	type SignerSetProgress,
} from './signers.service';

// A proposal with its account's signers and how far its signatures get it.
export type ProposalProgress = {
	proposal: ProposalWithSignatures;
	// The account's signers under the scope the caller asked for.
	signers: AccountSigners;
	// One per acting set, in the order of `signers.actingSets`.
	sets: SignerSetProgress[];
	// True when any one set reached its own threshold.
	hasReachedThreshold: boolean;
};

const proposalProgress = (
	proposal: ProposalWithSignatures,
	signers: AccountSigners,
): ProposalProgress => ({
	proposal,
	signers,
	...countSignatures(
		signers.actingSets,
		proposal.signatures.map((sig) => sig.publicKey),
	),
});

// The scope of a request on a network; for a proposal, always its own network.
const scopeOn = (
	signers: SignerScope['kind'],
	network: string,
): SignerScope =>
	signers === 'original'
		? ORIGINAL_SET
		: actingSetsOn(network as SuiNetwork);

// The account's signers under the scope, or `NotFoundError`.
const getAccountSigners = async (
	accountAddress: string,
	scope: SignerScope,
) => {
	const signers = await resolveAccountSigners(
		accountAddress,
		scope,
	);
	if (!signers) throw new NotFoundError();
	return signers;
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

// `proposals.id` is a 32-bit serial.
const MAX_PROPOSAL_ID = 2 ** 31 - 1;

const getProposalsByAccountAddress = async (
	multisigAddress: string,
	network: string,
	cursor: PaginationCursor,
	status?: ProposalStatus,
) => {
	// Any cursor that is not a valid id means the first page.
	const nextCursor = wholeNumberUpTo(
		cursor?.nextCursor,
		MAX_PROPOSAL_ID,
	);

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
	signers: SignerScope['kind'],
): Promise<ProposalStatus> => {
	if (proposal.status !== ProposalStatus.PENDING)
		return proposal.status;

	const accountSigners = await getAccountSigners(
		proposal.accountAddress,
		scopeOn(signers, proposal.network),
	);

	if (
		!proposalProgress(proposal, accountSigners)
			.hasReachedThreshold
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

// Whether the address is in the account's proposers list.
const isAccountProposer = async (
	accountAddress: string,
	address: string,
) =>
	(
		await AccountProposersDataLoader.load(accountAddress)
	).some((proposer) => proposer.address === address);

// The same question as of the account lock `tx` holds, so a removal that
// committed while waiting for it is seen.
const isAccountProposerUnderLock = async (
	tx: DatabaseTransaction,
	accountAddress: string,
	address: string,
) => {
	const [proposer] = await tx
		.select({ address: SchemaAccountProposers.address })
		.from(SchemaAccountProposers)
		.where(
			and(
				eq(
					SchemaAccountProposers.accountAddress,
					accountAddress,
				),
				eq(SchemaAccountProposers.address, address),
			),
		);
	return !!proposer;
};

// The base64 length of the largest transaction we accept.
const MAX_TRANSACTION_BASE64_LENGTH =
	Math.ceil(LIMITS.maxTransactionBytes / 3) * 4;

export type CreateProposalInput = {
	multisigAddress: string;
	transactionBytes: string;
	// The proposer's signature over the transaction.
	signature: string;
	// Unvalidated until `normalizeText`.
	description?: unknown;
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
	description: rawDescription,
	network: rawNetwork,
	signers,
}: CreateProposalInput & {
	signers: SignerScope['kind'];
}): Promise<Proposal> => {
	const network = validateNetwork(rawNetwork);

	if (!isValidSuiAddress(multisigAddress))
		throw new CommonError('InvalidAddress');

	if (
		transactionBytes.length > MAX_TRANSACTION_BASE64_LENGTH
	)
		throw new ValidationError(
			'The transaction is too large.',
		);

	// Line breaks stay allowed: the old frontend uses a multi-line field.
	const description = normalizeText(rawDescription, {
		maxLength: MAX_PROPOSAL_DESCRIPTION_LENGTH,
		allowLineBreaks: true,
		errors: {
			notAString:
				'The description must be a string or null.',
			forbiddenCharacters:
				'The description may not contain control or formatting characters.',
			tooLong: `The description must be at most ${MAX_PROPOSAL_DESCRIPTION_LENGTH} characters.`,
		},
	});

	assertCanonicalSignature(signature);

	// Get the public key out of the sui signature.
	const pubKey =
		getPublicKeyFromSerializedSignature(signature);
	const accountSigners = await getAccountSigners(
		multisigAddress,
		scopeOn(signers, network),
	);

	const isMember =
		keyAnswer(accountSigners, pubKey.toSuiPublicKey()) ===
		'accepted';
	// With no acting set on the network, nobody acts for the account there.
	const isProposer =
		accountSigners.actingSets.length > 0 &&
		(await isAccountProposer(
			multisigAddress,
			pubKey.toSuiAddress(),
		));

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

	if (
		proposedTransaction.getData().sender !== multisigAddress
	)
		throw new ValidationError(
			'The transaction sender does not match the multisig address.',
		);

	// A different gas owner would sign as sponsor with the member's signature.
	const gasOwner =
		proposedTransaction.getData().gasData.owner;
	if (gasOwner && gasOwner !== multisigAddress)
		throw new ValidationError(
			'The transaction gas owner does not match the account.',
		);

	// Verify the supplied user signature before doing any RPC work for the
	// request. A fully resolved transaction builds without a client.
	const built = await proposedTransaction.build();
	await verifyTransactionSignature(
		pubKey,
		built,
		signature,
	);

	// Look up the objects only this proposal may use before opening the
	// database transaction, so it is not held open during RPC calls.
	const exclusiveObjects = await getExclusiveObjects(
		proposedTransaction,
		network,
	);

	const proposal = await db.transaction(async (tx) => {
		// Validate the proposed transaction for:
		// 1. No other pending proposal with the same owned objects in them.
		// 2. The transaction is not already in a pending proposal.
		await validateProposedTransaction(
			tx,
			proposedTransaction,
			exclusiveObjects,
			multisigAddress,
			network,
		);

		// The proposer check above ran before the account lock, so a removal
		// may have committed since, without cancelling this proposal.
		if (
			!isMember &&
			!(await isAccountProposerUnderLock(
				tx,
				multisigAddress,
				pubKey.toSuiAddress(),
			))
		)
			throw new ApiAuthError('NotAMultisigMember');

		// Insert the proposal and the first sig!
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

		// We only save the signature as a vote if the proposer is a member.
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

		// The only copy of an external proposer's signature.
		await recordAccountEvent(tx, {
			action: 'proposal.created',
			accountAddress: multisigAddress,
			network,
			actor: proposal[0].proposerAddress,
			subject: proposal[0].digest,
			proof: {
				kind: 'proposal.create',
				version: 1,
				signature,
			},
		});

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
	signers,
}: {
	proposalId: number;
	// The member's signature over the proposal's transaction.
	signature: string;
	signers: SignerScope['kind'];
}): Promise<ProposalProgress> => {
	const proposal = await getProposalById(proposalId);

	assertCanonicalSignature(signature);

	const pubKey =
		getPublicKeyFromSerializedSignature(signature);

	// Any answer: a key of an acting set signs whether or not it accepted.
	const accountSigners = await resolveAccountSigners(
		proposal.accountAddress,
		scopeOn(signers, proposal.network),
	);
	if (
		!accountSigners ||
		keyAnswer(accountSigners, pubKey.toSuiPublicKey()) ===
			null
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

	return proposalProgress(proposal, accountSigners);
};

// Cancels a pending proposal. An accepted member can cancel any proposal; an
// external proposer can cancel only their own, and only while nobody has signed.
export const cancelProposal = async ({
	proposalId,
	signature,
	signers,
}: {
	proposalId: number;
	signature: string;
	signers: SignerScope['kind'];
}) => {
	const proposal = await getProposalById(proposalId);

	if (proposal.status !== ProposalStatus.PENDING)
		throw new ValidationError('Proposal is not pending');

	assertCanonicalSignature(signature);

	const pubKey =
		getPublicKeyFromSerializedSignature(signature);
	const signerAddress = pubKey.toSuiAddress();

	// Refuses outsiders before they can take the lock, and before the signature
	// is checked. The route is open, and this is the order callers rely on.
	const isMember = await isAccountSigner(
		proposal.accountAddress,
		[pubKey],
		{
			acceptedOnly: true,
			scope: scopeOn(signers, proposal.network),
		},
	);

	const isOwnProposer =
		!isMember &&
		signerAddress === proposal.proposerAddress &&
		(await isAccountProposer(
			proposal.accountAddress,
			signerAddress,
		));

	if (!isMember && !isOwnProposer)
		throw new ValidationError(
			'Not a member of the multisig',
		);

	await verifySignedMessage(
		signature,
		PersonalMessages.cancelProposal(
			proposal.digest,
			proposal.accountAddress,
		),
	);

	await db.transaction(async (tx) => {
		// First, as this touches the proposal before recording takes the lock.
		await lockAccount(tx, proposal.accountAddress);

		// A removal may have committed since the check above. A member needs no
		// second look: a cancel only touches the database, and a set that stopped
		// acting since is within the window the alias mirror already allows.
		if (
			!isMember &&
			!(await isAccountProposerUnderLock(
				tx,
				proposal.accountAddress,
				signerAddress,
			))
		)
			throw new ValidationError(
				'Not a member of the multisig',
			);

		// The first status check ran without the lock, so it may have moved. A
		// proposer's cancel is guarded in the same statement, so a signature
		// committed before it runs is never lost.
		const cancelled = await tx
			.update(SchemaProposals)
			.set({ status: ProposalStatus.CANCELLED })
			.where(
				and(
					eq(SchemaProposals.id, proposal.id),
					eq(
						SchemaProposals.status,
						ProposalStatus.PENDING,
					),
					isMember
						? undefined
						: notExists(
								tx
									.select()
									.from(SchemaProposalSignatures)
									.where(
										eq(
											SchemaProposalSignatures.proposalId,
											proposal.id,
										),
									),
							),
				),
			)
			.returning({ id: SchemaProposals.id });

		if (cancelled.length === 0) {
			// No row matched: the proposal has a signature or is no longer pending.
			const [{ status }] = await tx
				.select({ status: SchemaProposals.status })
				.from(SchemaProposals)
				.where(eq(SchemaProposals.id, proposal.id));
			throw new ValidationError(
				status === ProposalStatus.PENDING
					? 'A signer has already signed this proposal'
					: 'Proposal is not pending',
			);
		}

		await recordAccountEvent(tx, {
			action: 'proposal.cancelled',
			accountAddress: proposal.accountAddress,
			network: proposal.network,
			actor: signerAddress,
			subject: proposal.digest,
			proof: {
				kind: 'proposal.cancel',
				version: 2,
				signature,
			},
		});
	});

	multisigProposalEvents.inc({
		network: proposal.network,
		event_type: MultisigEventType.PROPOSAL_CANCELLED,
	});
};

// Verifies the execution of a proposal, for an accepted member.
export const verifyProposal = async ({
	proposalId,
	callerKeys,
	signers,
}: {
	proposalId: number;
	callerKeys: PublicKey[];
	signers: SignerScope['kind'];
}) => {
	const proposal = await getProposalById(proposalId);

	if (
		!(await isAccountSigner(
			proposal.accountAddress,
			callerKeys,
			{
				acceptedOnly: true,
				scope: scopeOn(signers, proposal.network),
			},
		))
	)
		throw new ApiAuthError('NotAMultisigMember');

	return await lookupAndVerifyProposal(proposal, signers);
};

// Verifies the execution of a proposal. Open to anyone: it only reads the
// chain.
export const verifyProposalByDigest = async (
	digest: string,
	signers: SignerScope['kind'],
) => {
	if (!isValidTransactionDigest(digest))
		throw new CommonError('InvalidDigest');

	const proposal =
		await ProposalByDigestLoader.load(digest);

	if (!proposal) throw new NotFoundError();

	return await lookupAndVerifyProposal(proposal, signers);
};

// Lists an account's proposals on a network, for an accepted member.
export const listProposals = async ({
	multisigAddress,
	network,
	status,
	cursor,
	callerKeys,
	signers,
}: {
	multisigAddress: string;
	network: string;
	// One of the `ProposalStatus` names. Parsed after the access check.
	status?: string;
	cursor: PaginationCursor;
	callerKeys: PublicKey[];
	signers: SignerScope['kind'];
}): Promise<PaginatedResponse<ProposalWithSignatures>> => {
	validateNetwork(network);

	if (
		!(await isAccountSigner(multisigAddress, callerKeys, {
			acceptedOnly: true,
			scope: scopeOn(signers, network),
		}))
	)
		throw new ApiAuthError('NotAMultisigMember');

	return await getProposalsByAccountAddress(
		multisigAddress,
		network,
		cursor,
		status ? proposalStatusFromString(status) : undefined,
	);
};

// A proposal by digest, with its account's signers and events. Public.
export const getProposalByDigest = async (
	digest: string,
	signers: SignerScope['kind'],
): Promise<
	ProposalProgress & { events: ProposalEvents }
> => {
	if (!isValidTransactionDigest(digest))
		throw new CommonError('InvalidDigest');

	const proposal =
		await ProposalByDigestLoader.load(digest);

	if (!proposal) throw new NotFoundError();

	const [accountSigners, events] = await Promise.all([
		getAccountSigners(
			proposal.accountAddress,
			scopeOn(signers, proposal.network),
		),
		getProposalEvents(proposal.id),
	]);

	return {
		...proposalProgress(proposal, accountSigners),
		events,
	};
};
