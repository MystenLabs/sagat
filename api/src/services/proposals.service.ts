// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Proposal flows. Like the signer set flows, they take plain input and the
 * caller's keys, throw the errors in `../errors`, and return domain objects
 * (rows, or composites like `ProposalProgress`).
 */

import {
	findAliasCalls,
	PersonalMessages,
} from '@mysten/sagat';
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
	type SQL,
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
import {
	aliasSetLoaders,
	type AliasSetLoaders,
} from '../loaders/alias-set.loader';
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
import {
	getPublicKeyFromSerializedSignature,
	signerAddressOf,
} from '../utils/pubKey';
import { normalizeText } from '../utils/text';
import {
	getProposalEvents,
	recordAccountEvent,
	type ProposalEvents,
} from './account-events.service';
import {
	isAccount,
	refreshAccount,
} from './accounts.service';
import {
	refreshAliases,
	refreshStaleAliases,
	requireFreshAliases,
} from './aliases.service';
import {
	isAccountSigner,
	notAcceptedSignerError,
} from './membership.service';
import {
	getExclusiveObjects,
	isCanonicalSuiAddress,
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
	ORIGINAL_SET,
	resolveAccountSigners,
	signsFor,
	type AccountSigners,
	type SignerScope,
	type SignerScopeKind,
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
	scopeKind: SignerScopeKind,
	network: string,
): SignerScope =>
	scopeKind === 'original'
		? ORIGINAL_SET
		: actingSetsOn(network as SuiNetwork);

const notAccepted = async (
	signers: () => Promise<AccountSigners | undefined>,
	keys: string[],
) => notAcceptedSignerError(await signers(), keys);

// The refusals that differ by scope; legacy keeps its texts.
const REFUSALS = {
	original: {
		notAccepted: async () =>
			new ApiAuthError('NotAMultisigMember'),
		// Neither an accepted signer nor the proposal's own proposer.
		notCanceller: async () =>
			new ValidationError('Not a member of the multisig'),
		// A proposer removed while their cancel waited for the lock.
		lostProposer: () =>
			new ValidationError('Not a member of the multisig'),
		notSigner: () => new ApiAuthError('NotAMultisigMember'),
		senderMismatch:
			'The transaction sender does not match the multisig address.',
		unreadableSignature: (error: unknown) => error,
	},
	acting: {
		notAccepted,
		notCanceller: notAccepted,
		lostProposer: () =>
			new ApiAuthError('NotAnAccountSigner'),
		notSigner: () => new ApiAuthError('NotAnAccountSigner'),
		senderMismatch:
			'The transaction sender does not match the account.',
		unreadableSignature: (error: unknown) =>
			error instanceof CommonError
				? new CommonError('InvalidTransactionSignature')
				: error,
	},
} satisfies Record<SignerScopeKind, object>;

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

// A proposal and its signatures, by a condition on its row.
const findProposal = async (
	condition: SQL,
): Promise<ProposalWithSignatures | undefined> => {
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
		.where(condition);

	if (result.length === 0) return undefined;

	const proposal = result[0].proposals;
	const signatures = result
		.filter((row) => row.proposal_signatures !== null)
		.map((row) => row.proposal_signatures)
		.filter((x) => !!x);

	return {
		...proposal,
		// The order the legacy read by digest answers with.
		signatures: signatures.map((s) => ({
			publicKey: s.publicKey,
			proposalId: s.proposalId,
			signature: s.signature,
		})),
	};
};

// Get a proposal by id, and its signatures.
export const getProposalById = async (
	proposalId: number,
): Promise<ProposalWithSignatures> => {
	const proposal = await findProposal(
		eq(SchemaProposals.id, proposalId),
	);
	if (!proposal)
		throw new ValidationError('Proposal not found');
	return proposal;
};

// The legacy routes address a proposal by id, `/v1` by digest.
export type ProposalKey =
	{ proposalId: number } | { digest: string };

const getProposal = async (
	key: ProposalKey,
): Promise<ProposalWithSignatures> => {
	if ('proposalId' in key)
		return getProposalById(key.proposalId);
	if (!isValidTransactionDigest(key.digest))
		throw new CommonError('InvalidDigest');
	const proposal = await findProposal(
		eq(SchemaProposals.digest, key.digest),
	);
	if (!proposal) throw new NotFoundError();
	return proposal;
};

// The calls to `0x2::address_alias` in a proposal's bytes.
export const aliasCallsOf = (transactionBytes: string) =>
	findAliasCalls(
		Transaction.from(transactionBytes).getData(),
	);

// Under the acting scope a decision waits for a fresh alias state, or fails.
const refreshBeforeDeciding = async (
	scopeKind: SignerScopeKind,
	accountAddress: string,
	network: string,
	loaders: AliasSetLoaders,
) => {
	if (scopeKind === 'acting')
		await requireFreshAliases(
			accountAddress,
			network as SuiNetwork,
			loaders,
		);
};

// Refreshes a stale alias state for a read; false when the read failed and the mirror is used as it is.
const refreshForRead = async (
	accountAddress: string,
	network: string,
	loaders: AliasSetLoaders,
) => {
	const [state] = await refreshStaleAliases(
		[accountAddress],
		network as SuiNetwork,
		loaders,
	);
	return state.outcome !== 'failed';
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
 * Checks a pending proposal on-chain, and records whether it succeeded and
 * the address that signed for the account. With `checkThreshold`, it first
 * needs enough signatures under the original set. Returns the proposal's status
 * afterwards; a proposal that is no longer pending is returned as is.
 */
const lookupAndVerifyProposal = async (
	proposal: ProposalWithSignatures,
	{
		checkThreshold = false,
		loaders,
	}: {
		checkThreshold?: boolean;
		loaders: AliasSetLoaders;
	},
): Promise<ProposalStatus> => {
	if (proposal.status !== ProposalStatus.PENDING)
		return proposal.status;

	if (checkThreshold) {
		const signers = await getAccountSigners(
			proposal.accountAddress,
			ORIGINAL_SET,
		);
		if (
			!proposalProgress(proposal, signers)
				.hasReachedThreshold
		)
			throw new ValidationError(
				'Proposal is not ready to execute',
			);
	}

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
	// The sender's signature comes first.
	const [senderSignature] = (
		tx.$kind === 'Transaction'
			? tx.Transaction
			: tx.FailedTransaction
	).signatures;
	const executedVia = senderSignature
		? signerAddressOf(senderSignature)
		: null;

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

	// The status is recorded; a failed refresh leaves the mirror to the next one.
	if (
		isSuccess &&
		aliasCallsOf(proposal.transactionBytes).length > 0
	)
		await refreshAliases(
			[proposal.accountAddress],
			proposal.network as SuiNetwork,
			loaders,
		).catch(() => undefined);

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

// The signer of a signature over a transaction; `/v1` refuses an unreadable one as one that does not verify.
const transactionSigner = (
	signature: string,
	scopeKind: SignerScopeKind,
) => {
	try {
		assertCanonicalSignature(signature);
		return getPublicKeyFromSerializedSignature(signature);
	} catch (error) {
		throw REFUSALS[scopeKind].unreadableSignature(error);
	}
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
	scopeKind,
	loaders = aliasSetLoaders,
}: CreateProposalInput & {
	scopeKind: SignerScopeKind;
	loaders?: AliasSetLoaders;
}): Promise<Proposal> => {
	const network = validateNetwork(rawNetwork);

	if (
		!(
			scopeKind === 'acting'
				? isCanonicalSuiAddress
				: isValidSuiAddress
		)(multisigAddress)
	)
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

	const pubKey = transactionSigner(signature, scopeKind);
	if (scopeKind === 'acting')
		await refreshAccount(multisigAddress, network, loaders);
	const signers = await getAccountSigners(
		multisigAddress,
		scopeOn(scopeKind, network),
	);

	const isMember = signsFor(
		signers,
		[pubKey.toSuiPublicKey()],
		true,
	);
	// With no acting set on the network, nobody acts for the account there.
	const isProposer =
		signers.actingSets.length > 0 &&
		(await isAccountProposer(
			multisigAddress,
			pubKey.toSuiAddress(),
		));

	const notMemberError = () =>
		REFUSALS[scopeKind].notAccepted(
			async () => signers,
			[pubKey.toSuiPublicKey()],
		);
	if (!isMember && !isProposer)
		throw await notMemberError();

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
			REFUSALS[scopeKind].senderMismatch,
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
			throw await notMemberError();

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
	signature,
	scopeKind,
	loaders = aliasSetLoaders,
	...key
}: ProposalKey & {
	// The member's signature over the proposal's transaction.
	signature: string;
	scopeKind: SignerScopeKind;
	loaders?: AliasSetLoaders;
}): Promise<ProposalProgress> => {
	const proposal = await getProposal(key);

	const pubKey = transactionSigner(signature, scopeKind);
	await refreshBeforeDeciding(
		scopeKind,
		proposal.accountAddress,
		proposal.network,
		loaders,
	);

	// Any answer: a key of an acting set signs whether or not it accepted.
	const signers = await resolveAccountSigners(
		proposal.accountAddress,
		scopeOn(scopeKind, proposal.network),
	);
	if (
		!signers ||
		!signsFor(signers, [pubKey.toSuiPublicKey()], false)
	)
		throw REFUSALS[scopeKind].notSigner();

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

	return proposalProgress(proposal, signers);
};

// Cancels a pending proposal. An accepted member can cancel any proposal; an
// external proposer can cancel only their own, and only while nobody has signed.
export const cancelProposal = async ({
	signature,
	scopeKind,
	loaders = aliasSetLoaders,
	...key
}: ProposalKey & {
	signature: string;
	scopeKind: SignerScopeKind;
	loaders?: AliasSetLoaders;
}) => {
	const proposal = await getProposal(key);

	if (proposal.status !== ProposalStatus.PENDING)
		throw new ValidationError('Proposal is not pending');

	assertCanonicalSignature(signature);

	const pubKey =
		getPublicKeyFromSerializedSignature(signature);
	const signerAddress = pubKey.toSuiAddress();
	await refreshBeforeDeciding(
		scopeKind,
		proposal.accountAddress,
		proposal.network,
		loaders,
	);

	// Refuses outsiders before they can take the lock, and before the signature
	// is checked. The route is open, and this is the order callers rely on.
	const isMember = await isAccountSigner(
		proposal.accountAddress,
		[pubKey],
		{
			acceptedOnly: true,
			scope: scopeOn(scopeKind, proposal.network),
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
		throw await REFUSALS[scopeKind].notCanceller(
			() =>
				resolveAccountSigners(
					proposal.accountAddress,
					scopeOn(scopeKind, proposal.network),
				),
			[pubKey.toSuiPublicKey()],
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
			throw REFUSALS[scopeKind].lostProposer();

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

// Verifies the execution of a proposal, for an accepted member of the original set.
export const verifyProposal = async ({
	proposalId,
	callerKeys,
}: {
	proposalId: number;
	callerKeys: PublicKey[];
}) => {
	const proposal = await getProposalById(proposalId);

	if (
		!(await isAccountSigner(
			proposal.accountAddress,
			callerKeys,
			{
				acceptedOnly: true,
				scope: ORIGINAL_SET,
			},
		))
	)
		throw new ApiAuthError('NotAMultisigMember');

	return await lookupAndVerifyProposal(proposal, {
		checkThreshold: true,
		loaders: aliasSetLoaders,
	});
};

// Verifies the execution of a proposal. Open to anyone: it only reads the
// chain. Only the original scope keeps the threshold check first.
export const verifyProposalByDigest = async (
	digest: string,
	scopeKind: SignerScopeKind,
	loaders: AliasSetLoaders = aliasSetLoaders,
) =>
	await lookupAndVerifyProposal(
		await getProposal({ digest }),
		{
			checkThreshold: scopeKind === 'original',
			loaders,
		},
	);

type ListInput = {
	multisigAddress: string;
	network: string;
	// One of the `ProposalStatus` names. Parsed after the access check.
	status?: string;
	cursor: PaginationCursor;
	callerKeys: PublicKey[];
};

// Both lists: the access check, then one page.
const listProposalPage = async ({
	multisigAddress,
	network,
	status,
	cursor,
	callerKeys,
	scopeKind,
}: ListInput & { scopeKind: SignerScopeKind }) => {
	const scope = scopeOn(scopeKind, network);
	if (
		!(await isAccountSigner(multisigAddress, callerKeys, {
			acceptedOnly: true,
			scope,
		}))
	)
		throw await REFUSALS[scopeKind].notAccepted(
			() => resolveAccountSigners(multisigAddress, scope),
			callerKeys.map((key) => key.toSuiPublicKey()),
		);

	return await getProposalsByAccountAddress(
		multisigAddress,
		network,
		cursor,
		status ? proposalStatusFromString(status) : undefined,
	);
};

// Lists an account's proposals on a network, for an accepted member.
export const listProposals = async (
	input: ListInput,
): Promise<PaginatedResponse<ProposalWithSignatures>> => {
	validateNetwork(input.network);
	return await listProposalPage({
		...input,
		scopeKind: 'original',
	});
};

const NO_EVENTS: ProposalEvents = {
	created: null,
	proposer: null,
	cancelled: null,
};

export type CheckedProposal = ProposalProgress & {
	events: ProposalEvents;
	// True when the alias read failed and the signers come from the mirror as it was.
	signerSetsStale: boolean;
};

// A page of an account's proposals under the acting scope, each counted against the sets that act now.
export const listAccountProposals = async ({
	loaders = aliasSetLoaders,
	...input
}: ListInput & {
	network: SuiNetwork;
	loaders?: AliasSetLoaders;
}): Promise<PaginatedResponse<CheckedProposal>> => {
	const signerSetsStale =
		(await isAccount(input.multisigAddress)) &&
		!(await refreshForRead(
			input.multisigAddress,
			input.network,
			loaders,
		));
	const page = await listProposalPage({
		...input,
		scopeKind: 'acting',
	});
	const [signers, events] = await Promise.all([
		getAccountSigners(
			input.multisigAddress,
			actingSetsOn(input.network),
		),
		getProposalEvents(page.data.map((p) => p.id)),
	]);
	return {
		...page,
		data: page.data.map((proposal) => ({
			...proposalProgress(proposal, signers),
			events: events.get(proposal.id) ?? NO_EVENTS,
			signerSetsStale,
		})),
	};
};

// A proposal by digest, with its account's signers and events. Public.
export const getProposalByDigest = async (
	digest: string,
	scopeKind: SignerScopeKind,
	loaders: AliasSetLoaders = aliasSetLoaders,
): Promise<CheckedProposal> => {
	const proposal = await getProposal({ digest });

	const signerSetsStale =
		scopeKind !== 'original' &&
		!(await refreshForRead(
			proposal.accountAddress,
			proposal.network,
			loaders,
		));
	const [signers, events] = await Promise.all([
		getAccountSigners(
			proposal.accountAddress,
			scopeOn(scopeKind, proposal.network),
		),
		getProposalEvents([proposal.id]),
	]);

	return {
		...proposalProgress(proposal, signers),
		events: events.get(proposal.id) ?? NO_EVENTS,
		signerSetsStale,
	};
};
