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
	signerChangeProof,
	signersWhoStay,
} from '@mysten/sagat';
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
	ServedByV1OnlyError,
	ValidationError,
} from '../errors';
import { AccountProposersDataLoader } from '../loaders/account-proposers.loader';
import {
	MultisigEventType,
	multisigProposalEvents,
} from '../metrics';
import { type SuiNetwork } from '../utils/client';
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
	refuseChangedAccount,
	refuseIfChangedAccount,
} from './changed-accounts.service';
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
	aliasCallsOf,
	lookUpOnChainOutcome,
	recordOnChainOutcome,
} from './onchain-outcomes.service';
import {
	assertCanonicalSignature,
	verifySignedMessage,
	verifyTransactionSignature,
} from './signatures.service';
import {
	assertExpiresSoon,
	assertNamesChain,
	assertNoPendingAliasProposal,
	checkAndWriteSignerChange,
	currentEpochOf,
	signerChangeIn,
	signerChangeLabels,
	signerChangeNote,
} from './signer-changes.service';
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
	// One per acting set, in the order of `signers.actingSets`; for a signer change, only the old set: while pending, only while it acts.
	sets: SignerSetProgress[];
	// True when any one set reached its own threshold; for a pending signer change, only once a new set's signers also met theirs.
	hasReachedThreshold: boolean;
	signerChange: ReturnType<typeof signerChangeIn>;
};

const proposalProgress = (
	proposal: ProposalWithSignatures,
	signers: AccountSigners,
	signerChange = signerChangeIn(proposal.transactionBytes),
): ProposalProgress => {
	// A note that does not check is never ready; once not pending, the old set is read from the change.
	const oldSet = signerChange?.change?.oldSet;
	const sets = !signerChange
		? signers.actingSets
		: proposal.status !== ProposalStatus.PENDING && oldSet
			? [
					{
						address: oldSet.address,
						threshold: oldSet.threshold,
						members: oldSet.members.map(
							({ publicKey, weight }, order) => ({
								publicKey,
								weight,
								order,
							}),
						),
					},
				]
			: signers.actingSets.filter(
					(set) => set.address === oldSet?.address,
				);
	const keys = proposal.signatures.map(
		(sig) => sig.publicKey,
	);
	const counted = countSignatures(sets, keys);
	const change = signerChange?.change;
	return {
		proposal,
		signers,
		...counted,
		// A pending change also needs its new set's own threshold.
		hasReachedThreshold:
			counted.hasReachedThreshold &&
			(!change ||
				proposal.status !== ProposalStatus.PENDING ||
				signerChangeProof(change, keys).met),
		signerChange,
	};
};

const checkedProposal = (
	proposal: ProposalWithSignatures,
	signers: AccountSigners,
	events: ProposalEvents,
	signerSetsStale: boolean,
	signerChange?: ProposalProgress['signerChange'],
): CheckedProposal => ({
	...proposalProgress(proposal, signers, signerChange),
	events,
	signerSetsStale,
});

// No legacy route serves a signer change: it is a `/v1` feature.
const refuseSignerChangeUnder = (
	scopeKind: SignerScopeKind,
	signerChange: ProposalProgress['signerChange'],
) => {
	if (scopeKind === 'original' && signerChange !== null)
		throw new ServedByV1OnlyError('A signer change');
};

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

const USED_OBJECTS =
	'These owned/receiving objects are already used by pending proposals: ';

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
		unreadableTransaction: (error: unknown) => error,
		usedObjects: (ids: string[]) =>
			USED_OBJECTS + ids.join(', '),
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
		unreadableTransaction: () =>
			new ValidationError(
				'The transaction cannot be read.',
			),
		// Names three objects at most.
		usedObjects: (ids: string[]) =>
			ids.length <= 3
				? USED_OBJECTS + ids.join(', ')
				: `${USED_OBJECTS}${ids.slice(0, 3).join(', ')} and ${ids.length - 3} more.`,
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

const getProposalById = async (
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

// A decision waits for a fresh alias state, or fails; the original scope refuses a changed account.
const refreshBeforeDeciding = async (
	scopeKind: SignerScopeKind,
	accountAddress: string,
	network: string,
) => {
	if (scopeKind === 'acting')
		await requireFreshAliases(
			accountAddress,
			network as SuiNetwork,
		);
	else await refuseChangedAccount(accountAddress, 'write');
};

// False when the read failed and the mirror is used as it is.
const refreshForRead = async (
	accountAddress: string,
	network: string,
) => {
	const [state] = await refreshStaleAliases(
		[accountAddress],
		network as SuiNetwork,
	);
	return state.outcome !== 'failed';
};

// `proposals.id` is a 32-bit serial.
const MAX_PROPOSAL_ID = 2 ** 31 - 1;

// Both lists, after their access check: one page.
const getProposalsByAccountAddress = async ({
	multisigAddress,
	network,
	status: statusName,
	cursor,
	// Rows it leaves out still move the cursor.
	keep = () => true,
}: Omit<ListInput, 'callerKeys'> & {
	keep?: (proposal: Proposal) => boolean;
}) => {
	const status = statusName
		? proposalStatusFromString(statusName)
		: undefined;
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

	for (const proposal of page.filter(keep)) {
		const signaturesForProposal = signatures.filter(
			(s) => s.proposalId === proposal.id,
		);
		result.push({
			...proposal,
			signatures: signaturesForProposal,
		});
	}

	const nextPageCursor =
		page.length > 0 ? page[page.length - 1]?.id : undefined;

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
 * needs enough signatures under the original set. A cancelled proposal that
 * calls the alias module is looked up too, and stays cancelled when not on
 * chain. Returns the proposal's status afterwards; any other proposal that is
 * no longer pending is returned as is.
 */
const lookupAndVerifyProposal = async (
	proposal: ProposalWithSignatures,
	{ checkThreshold = false }: { checkThreshold?: boolean },
): Promise<ProposalStatus> => {
	const isPending =
		proposal.status === ProposalStatus.PENDING;
	if (
		!isPending &&
		proposal.status !== ProposalStatus.CANCELLED
	)
		return proposal.status;
	const callsAliasModule =
		aliasCallsOf(proposal.transactionBytes).length > 0;
	if (!isPending && !callsAliasModule)
		return proposal.status;

	if (isPending && checkThreshold) {
		const signers = await getAccountSigners(
			proposal.accountAddress,
			ORIGINAL_SET,
		);
		// Only reads the chain afterwards, so it counts every signature as stored.
		if (
			!countSignatures(
				signers.actingSets,
				proposal.signatures.map((sig) => sig.publicKey),
			).hasReachedThreshold
		)
			throw new ValidationError(
				'Proposal is not ready to execute',
			);
	}

	const outcome = await lookUpOnChainOutcome(
		proposal.network as SuiNetwork,
		proposal.digest,
	);
	if (!outcome) {
		if (!isPending) return proposal.status;
		// TODO: a transaction that isn't on-chain may also never be able to
		// run, e.g. when one of its owned inputs was spent elsewhere. Such a
		// proposal stays pending and blocks new proposals that use the same
		// objects. Detect it (an input's version changed or it was deleted)
		// and move the proposal to a new terminal status for it (not
		// FAILURE, which means the transaction failed on-chain).
		throw new ValidationError(
			'The transaction has not been executed yet.',
		);
	}

	await recordOnChainOutcome(db, proposal, outcome);

	// The status is recorded; a failed refresh leaves the mirror to the next one.
	if (
		outcome.status === ProposalStatus.SUCCESS &&
		callsAliasModule
	)
		await refreshAliases(
			[proposal.accountAddress],
			proposal.network as SuiNetwork,
		).catch(() => undefined);

	return outcome.status;
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
	// For a signer change that adds a set, aligned with its members. Unvalidated until `normalizeKeyLabels`.
	labels?: unknown;
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
	labels: rawLabels,
	scopeKind,
}: CreateProposalInput & {
	scopeKind: SignerScopeKind;
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
	// Under the acting scope the signature is checked before the account.
	const signatureFirst = scopeKind === 'acting';
	const checkAccount = async () => {
		if (scopeKind === 'acting')
			await refreshAccount(multisigAddress, network);
		else
			await refuseIfChangedAccount(
				multisigAddress,
				'write',
			);
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
		return { isMember, notMemberError };
	};
	const originalAccount = signatureFirst
		? undefined
		: await checkAccount();

	// Parses or builds the bytes; `/v1` refuses bytes that fail as a 400.
	const readable = async <T>(
		read: () => T | Promise<T>,
	) => {
		try {
			return await read();
		} catch (error) {
			throw REFUSALS[scopeKind].unreadableTransaction(
				error,
			);
		}
	};
	const proposedTransaction = await readable(() =>
		Transaction.from(transactionBytes),
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

	const data = proposedTransaction.getData();
	const callsAliasModule = findAliasCalls(data).length > 0;

	// Alias calls with a composition note make a signer change.
	const note = signerChangeNote(data);
	if (note && scopeKind === 'original')
		throw new ServedByV1OnlyError('A signer change');
	const labels = signerChangeLabels(note, rawLabels);

	// Verify the supplied user signature before doing any RPC work for the
	// request. A fully resolved transaction builds without a client.
	const built = await readable(() =>
		proposedTransaction.build(),
	);
	await verifyTransactionSignature(
		pubKey,
		built,
		signature,
	);
	const { isMember, notMemberError } =
		originalAccount ?? (await checkAccount());

	// Look up the objects only this proposal may use before opening the
	// database transaction, so it is not held open during RPC calls.
	const exclusiveObjects = await getExclusiveObjects(
		proposedTransaction,
		network,
	);
	if (note) await assertNamesChain(data, network);
	const epoch = callsAliasModule
		? await currentEpochOf(network)
		: null;
	if (note && epoch !== null)
		assertExpiresSoon(data, epoch);

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
			REFUSALS[scopeKind].usedObjects,
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

		if (epoch !== null)
			await assertNoPendingAliasProposal(
				tx,
				multisigAddress,
				network,
				epoch,
			);
		if (note)
			await checkAndWriteSignerChange(tx, {
				accountAddress: multisigAddress,
				network,
				data,
				note,
				proposer: pubKey,
				labels,
			});

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
	...key
}: ProposalKey & {
	// The member's signature over the proposal's transaction.
	signature: string;
	scopeKind: SignerScopeKind;
}): Promise<ProposalProgress> => {
	const proposal = await getProposal(key);
	const stored = signerChangeIn(proposal.transactionBytes);
	refuseSignerChangeUnder(scopeKind, stored);

	const pubKey = transactionSigner(signature, scopeKind);
	const signatureFirst = scopeKind === 'acting';
	const verifySignature = () =>
		verifyTransactionSignature(
			pubKey,
			fromBase64(proposal.transactionBytes),
			signature,
		);
	if (signatureFirst) await verifySignature();
	await refreshBeforeDeciding(
		scopeKind,
		proposal.accountAddress,
		proposal.network,
	);

	// A key a signer change adds signs it too; its signature never counts for the old set.
	const inNewSet = !!stored?.change?.newSets.some((set) =>
		set.members.some(
			(member) =>
				member.publicKey === pubKey.toSuiPublicKey(),
		),
	);

	// Any answer: a key of an acting set signs whether or not it accepted.
	const signers = await resolveAccountSigners(
		proposal.accountAddress,
		scopeOn(scopeKind, proposal.network),
	);
	if (
		!signers ||
		(!inNewSet &&
			!signsFor(signers, [pubKey.toSuiPublicKey()], false))
	)
		throw REFUSALS[scopeKind].notSigner();

	// A set is replaced by its own signers.
	if (
		stored &&
		!inNewSet &&
		!(
			stored.change &&
			stored.change.oldSet.members.some(
				(member) =>
					member.publicKey === pubKey.toSuiPublicKey(),
			)
		)
	)
		throw new ApiAuthError('NotASignerOfTheChange');

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

	if (!signatureFirst) await verifySignature();

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

	return proposalProgress(proposal, signers, stored);
};

// Cancels a pending proposal. An accepted member can cancel any proposal; an
// external proposer can cancel only their own, and only while nobody has signed.
export const cancelProposal = async ({
	signature,
	scopeKind,
	...key
}: ProposalKey & {
	signature: string;
	scopeKind: SignerScopeKind;
}) => {
	const proposal = await getProposal(key);
	const stored = signerChangeIn(proposal.transactionBytes);
	refuseSignerChangeUnder(scopeKind, stored);

	if (proposal.status !== ProposalStatus.PENDING)
		throw new ValidationError('Proposal is not pending');

	assertCanonicalSignature(signature);

	const pubKey =
		getPublicKeyFromSerializedSignature(signature);
	const signerAddress = pubKey.toSuiAddress();
	const signatureFirst = scopeKind === 'acting';
	const verifySignature = () =>
		verifySignedMessage(
			signature,
			PersonalMessages.cancelProposal(
				proposal.digest,
				proposal.accountAddress,
			),
		);
	if (signatureFirst) await verifySignature();
	await refreshBeforeDeciding(
		scopeKind,
		proposal.accountAddress,
		proposal.network,
	);

	// Refuses outsiders before they can take the lock; under the original set,
	// also before the signature is checked, the order legacy callers rely on.
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

	const change = stored?.change;
	// Once the old set no longer acts, the change can never execute, and any accepted signer may cancel it.
	const oldSetActs =
		!change ||
		!!(
			await resolveAccountSigners(
				proposal.accountAddress,
				actingSetsOn(proposal.network as SuiNetwork),
			)
		)?.actingSets.some(
			(set) => set.address === change.oldSet.address,
		);
	if (
		stored &&
		!(
			isMember &&
			(!oldSetActs ||
				change?.newSets.some((set) =>
					signersWhoStay(change.oldSet, set).includes(
						pubKey.toSuiPublicKey(),
					),
				))
		)
	)
		throw new ApiAuthError('CancelBySignerWhoStays');

	if (!signatureFirst) await verifySignature();

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
	});
};

// Verifies the execution of a proposal. Open to anyone: it only reads the
// chain. Only the original scope keeps the threshold check first.
export const verifyProposalByDigest = async (
	digest: string,
	scopeKind: SignerScopeKind,
) =>
	await lookupAndVerifyProposal(
		await getProposal({ digest }),
		{
			checkThreshold: scopeKind === 'original',
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

// Its rows carry their signatures as stored, so signer changes are left out.
export const listProposals = async (
	input: ListInput,
): Promise<PaginatedResponse<ProposalWithSignatures>> => {
	validateNetwork(input.network);
	await refuseIfChangedAccount(
		input.multisigAddress,
		'read',
	);
	if (
		!(await isAccountSigner(
			input.multisigAddress,
			input.callerKeys,
			{ acceptedOnly: true, scope: ORIGINAL_SET },
		))
	)
		throw await REFUSALS.original.notAccepted();
	return await getProposalsByAccountAddress({
		...input,
		keep: (proposal) =>
			signerChangeIn(proposal.transactionBytes) === null,
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
export const listAccountProposals = async (
	input: ListInput & { network: SuiNetwork },
): Promise<PaginatedResponse<CheckedProposal>> => {
	const signerSetsStale =
		(await isAccount(input.multisigAddress)) &&
		!(await refreshForRead(
			input.multisigAddress,
			input.network,
		));
	const keys = input.callerKeys.map((key) =>
		key.toSuiPublicKey(),
	);
	const signers = await resolveAccountSigners(
		input.multisigAddress,
		actingSetsOn(input.network),
	);
	if (!signers || !signsFor(signers, keys, true))
		throw notAcceptedSignerError(signers, keys);
	const page = await getProposalsByAccountAddress(input);
	const events = await getProposalEvents(
		page.data.map((p) => p.id),
	);
	return {
		...page,
		data: page.data.map((proposal) =>
			checkedProposal(
				proposal,
				signers,
				events.get(proposal.id) ?? NO_EVENTS,
				signerSetsStale,
			),
		),
	};
};

// A proposal by digest, with its account's signers and events. Public.
export const getProposalByDigest = async (
	digest: string,
	scopeKind: SignerScopeKind,
): Promise<CheckedProposal> => {
	const proposal = await getProposal({ digest });
	const stored = signerChangeIn(proposal.transactionBytes);
	refuseSignerChangeUnder(scopeKind, stored);

	if (scopeKind === 'original')
		await refuseChangedAccount(
			proposal.accountAddress,
			'read',
		);
	const signerSetsStale =
		scopeKind !== 'original' &&
		!(await refreshForRead(
			proposal.accountAddress,
			proposal.network,
		));
	const [signers, events] = await Promise.all([
		getAccountSigners(
			proposal.accountAddress,
			scopeOn(scopeKind, proposal.network),
		),
		getProposalEvents([proposal.id]),
	]);

	return checkedProposal(
		proposal,
		signers,
		events.get(proposal.id) ?? NO_EVENTS,
		signerSetsStale,
		stored,
	);
};
