import { PersonalMessages } from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import {
	fromBase64,
	isValidTransactionDigest,
} from '@mysten/sui/utils';
import { eq } from 'drizzle-orm';
import { Context, Hono } from 'hono';

import { db } from '../db';
import { validateNetwork } from '../db/env';
import {
	ProposalStatus,
	proposalStatusFromString,
	SchemaProposals,
	SchemaProposalSignatures,
} from '../db/schema';
import {
	ApiAuthError,
	CommonError,
	NotFoundError,
	ValidationError,
} from '../errors';
import { ProposalByDigestLoader } from '../loaders/proposals.loader';
import { validatePersonalMessage } from '../services/addresses.service';
import {
	AuthEnv,
	authMiddleware,
} from '../services/auth.service';
import {
	getMultisig,
	isMultisigMember,
	jwtHasMultisigMemberAccess,
	validateProposedTransaction,
} from '../services/multisig.service';
import {
	getProposalById,
	getProposalsByMultisigAddress,
} from '../services/proposals.service';
import { getSuiClient, SuiNetwork } from '../utils/client';
import { newCursor } from '../utils/pagination';
import { getPublicKeyFromSerializedSignature } from '../utils/pubKey';

const proposalsRouter = new Hono();

// Create a new proposed multi-sig transaction.
proposalsRouter.post('/', async (c) => {
	const {
		multisigAddress,
		transactionBytes,
		signature,
		description,
		network,
	} = await c.req.json();

	validateNetwork(network);

	// Get the public key out of the sui signature.
	const pubKey =
		getPublicKeyFromSerializedSignature(signature);
	const multisig = await getMultisig(multisigAddress);

	const isMember = multisig.members.some(
		(member) =>
			member.publicKey === pubKey.toSuiPublicKey() &&
			member.isAccepted,
	);
	const isProposer = multisig.proposers.some(
		(proposer) =>
			proposer.address === pubKey.toSuiAddress(),
	);

	if (!isMember && !isProposer)
		throw new ApiAuthError('NotAMultisigMember');

	const proposedTransaction = Transaction.from(
		transactionBytes,
	);

	// Validate the proposed transaction for:
	// 1. No other pending proposal with the same owned objects in them.
	// 2. The transaction is fully resolved.
	// 3. The transaction is not already in a pending proposal.
	await validateProposedTransaction(
		proposedTransaction,
		multisigAddress,
		network,
	);

	// Build the transaction to verify the supplied user signature
	const built = await proposedTransaction.build({
		client: getSuiClient(network),
	});

	// Verify the supplied user signature.
	const isValidSuiSignature =
		await pubKey.verifyTransaction(built, signature);

	if (!isValidSuiSignature)
		throw new ValidationError(
			'Invalid Sui signature for the proposed transaction.',
		);

	// Insert the proposal and the first sig!
	const proposal = await db.transaction(async (tx) => {
		const proposal = await tx
			.insert(SchemaProposals)
			.values({
				multisigAddress,
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
		}

		return proposal[0];
	});

	return c.json(proposal, 201);
});

// Adds a signature for the transaction.
proposalsRouter.post('/:proposalId/vote', async (c) => {
	const { signature } = await c.req.json();
	const { proposalId } = c.req.param();

	const proposal = await getProposalById(
		parseInt(proposalId),
	);

	const pubKey =
		getPublicKeyFromSerializedSignature(signature);

	if (
		!(await isMultisigMember(
			proposal.multisigAddress,
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

	const isValidSuiSignature =
		await pubKey.verifyTransaction(
			fromBase64(proposal.transactionBytes),
			signature,
		);

	if (!isValidSuiSignature)
		throw new ValidationError(
			'Invalid Sui signature for the proposed transaction.',
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

	const multisig = await getMultisig(
		proposal.multisigAddress,
	);
	let totalVotes = 0;

	for (const sig of proposal.signatures) {
		totalVotes +=
			multisig.members.find(
				(member) => member?.publicKey === sig?.publicKey,
			)?.weight || 0;
	}

	return c.json({
		hasReachedThreshold: totalVotes >= multisig.threshold,
	});
});

// Cancel a transaction as a valid member of the commitee.
// TODO: this is pretty powerful (but probably safe to do).
proposalsRouter.post('/:proposalId/cancel', async (c) => {
	const { proposalId } = c.req.param();
	const { signature } = await c.req.json();

	const proposal = await getProposalById(
		parseInt(proposalId),
	);

	if (proposal.status !== ProposalStatus.PENDING)
		throw new ValidationError('Proposal is not pending');

	const pubKey =
		getPublicKeyFromSerializedSignature(signature);

	if (
		!(await isMultisigMember(
			proposal.multisigAddress,
			pubKey,
		))
	)
		throw new ValidationError(
			'Not a member of the multisig',
		);

	await validatePersonalMessage(
		pubKey,
		signature,
		PersonalMessages.cancelProposal(parseInt(proposalId)),
	);

	await db
		.update(SchemaProposals)
		.set({ status: ProposalStatus.CANCELLED })
		.where(eq(SchemaProposals.id, proposal.id));

	return c.json({
		message: 'Proposal cancelled successfully',
	});
});

// Verify the execution of a proposal.
proposalsRouter.post(
	'/:proposalId/verify',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const publicKeys = c.get('publicKeys');
		const { proposalId } = c.req.param();
		const proposal = await getProposalById(
			parseInt(proposalId),
		);

		if (
			!(await jwtHasMultisigMemberAccess(
				proposal.multisigAddress,
				publicKeys,
			))
		)
			throw new ApiAuthError('NotAMultisigMember');

		if (proposal.status !== ProposalStatus.PENDING)
			return c.json({ verified: true });

		const tx = await getSuiClient(
			proposal.network as SuiNetwork,
		).getTransactionBlock({
			digest: proposal.digest,
			options: { showEffects: true },
		});

		if (!tx.checkpoint || !tx.effects)
			throw new ValidationError('Transaction not found');

		const isSuccess =
			tx.effects.status.status === 'success';

		await db
			.update(SchemaProposals)
			.set({
				status: isSuccess
					? ProposalStatus.SUCCESS
					: ProposalStatus.FAILURE,
			})
			.where(eq(SchemaProposals.id, proposal.id));

		return c.json({ verified: true });
	},
);

proposalsRouter.get(
	'/',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const publicKeys = c.get('publicKeys');
		const {
			multisigAddress,
			status,
			network,
			nextCursor,
			perPage,
		} = c.req.query();
		validateNetwork(network);

		if (
			!(await jwtHasMultisigMemberAccess(
				multisigAddress,
				publicKeys,
			))
		)
			throw new ApiAuthError('NotAMultisigMember');

		const proposals = await getProposalsByMultisigAddress(
			multisigAddress,
			network,
			newCursor({ nextCursor, perPage }),
			status ? proposalStatusFromString(status) : undefined,
		);

		return c.json(proposals);
	},
);

proposalsRouter.get(
	'/digest/:digest',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const publicKeys = c.get('publicKeys');
		const { digest } = c.req.param();

		if (!isValidTransactionDigest(digest))
			throw new CommonError('InvalidDigest');

		const proposal =
			await ProposalByDigestLoader.load(digest);

		if (!proposal) throw new NotFoundError();

		if (
			!(await jwtHasMultisigMemberAccess(
				proposal.multisigAddress,
				publicKeys,
				false,
			))
		)
			throw new ApiAuthError('NotAMultisigMember');

		return c.json(proposal);
	},
);

export default proposalsRouter;
