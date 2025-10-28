// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersonalMessages } from '@mysten/sagat';
import { type PublicKey } from '@mysten/sui/cryptography';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { LIMITS } from '../constants/limits';
import { db } from '../db';
import {
	ProposalStatus,
	SchemaMultisigMembers,
	SchemaMultisigProposers,
	SchemaMultisigs,
	SchemaProposals,
} from '../db/schema';
import {
	ApiAuthError,
	CommonError,
	ValidationError,
} from '../errors';
import {
	registerPublicKeyStrings,
	validatePersonalMessage,
} from '../services/addresses.service';
import {
	authMiddleware,
	validateExpiry,
	type AuthEnv,
} from '../services/auth.service';
import {
	getMultisig,
	isMultisigFinalized,
	isMultisigMember,
	jwtHasMultisigMemberAccess,
	validateQuorum,
} from '../services/multisig.service';
import {
	getPublicKeyFromSerializedSignature,
	parsePublicKey,
} from '../utils/pubKey';

const multisigRouter = new Hono();

// Get multisig details by address (authenticated)
multisigRouter.get(
	'/:address',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const { address } = c.req.param();
		const publicKeys = c.get('publicKeys');

		// Verify the authenticated user is a member of this multisig
		const hasAccess = await jwtHasMultisigMemberAccess(
			address,
			publicKeys,
			false,
		);

		if (!hasAccess) {
			return c.json(
				{
					error:
						'Access denied. You are not a member of this multisig.',
				},
				403,
			);
		}

		const multisig = await getMultisig(address);
		return c.json(multisig);
	},
);

multisigRouter.post(
	'/',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const {
			publicKeys,
			weights,
			threshold,
			name,
		}: {
			publicKeys: string[];
			weights: number[];
			threshold: number;
			name?: string;
		} = await c.req.json();

		// Get a list of the public keys that are authorized.
		const authorizedPubKeys = c.get('publicKeys');

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

		const multisig = MultiSigPublicKey.fromPublicKeys({
			threshold,
			publicKeys: parsedPubKeys.map((key, index) => ({
				publicKey: key,
				weight: weights[index],
			})),
		});

		// add the multisig to the database.
		const database = await db.transaction(async (tx) => {
			const msig = (
				await tx
					.insert(SchemaMultisigs)
					.values({
						address: multisig.toSuiAddress(),
						isVerified: false,
						threshold,
						name,
					})
					.returning()
			)[0];

			// insert the multisig members in the DB.
			const members = await tx
				.insert(SchemaMultisigMembers)
				.values(
					parsedPubKeys.map((key, index) => ({
						multisigAddress: msig.address,
						publicKey: key.toSuiPublicKey(),
						weight:
							weights[
								addresses.findIndex(
									(addr) => addr === key.toSuiAddress(),
								)
							],
						// If authorization includes the user, we can accept immediately.
						isAccepted: authorizedPubKeys.some(
							(k) =>
								k.toSuiAddress() === key.toSuiAddress(),
						),
						order: index,
					})),
				)
				.returning();

			return {
				multisig: msig,
				members,
			};
		});

		return c.json(database);
	},
);

// Accept participation in a multisig scheme as a public key holder.
multisigRouter.post('/:address/accept', async (c) => {
	const { signature } = await c.req.json();
	const { address } = c.req.param();

	const pubKey =
		getPublicKeyFromSerializedSignature(signature);

	if (!(await isMultisigMember(address, pubKey, false)))
		throw new ValidationError(
			'You are not a member of this multisig',
		);

	await validatePersonalMessage(
		pubKey,
		signature,
		PersonalMessages.acceptMultisigInvitation(address),
	);

	const existingConnections =
		await db.query.SchemaMultisigMembers.findMany({
			where: and(
				eq(
					SchemaMultisigMembers.publicKey,
					pubKey.toSuiPublicKey(),
				),
				eq(SchemaMultisigMembers.isAccepted, true),
			),
		});

	// Maximum connections per public key.
	if (
		existingConnections.length >
		LIMITS.maxMultisigsPerPublicKey
	)
		throw new ValidationError(
			'You have reached the maximum number of multisigs for this public key',
		);

	const result = await db.transaction(async (tx) => {
		const msig = await tx.query.SchemaMultisigs.findFirst({
			where: eq(SchemaMultisigs.address, address),
		});

		if (!msig)
			throw new ValidationError('Multisig not found');

		await tx
			.update(SchemaMultisigMembers)
			.set({ isAccepted: true, isRejected: false })
			.where(
				and(
					eq(
						SchemaMultisigMembers.multisigAddress,
						address,
					),
					eq(
						SchemaMultisigMembers.publicKey,
						pubKey.toSuiPublicKey(),
					),
				),
			);

		const isFinalized = await isMultisigFinalized(
			address,
			tx,
		);
		// if all members have accepted, we can finalize the multisig.
		if (isFinalized) {
			await tx
				.update(SchemaMultisigs)
				.set({ isVerified: true })
				.where(eq(SchemaMultisigs.address, address));
		}
		msig.isVerified = isFinalized;
		return msig;
	});

	return c.json(result);
});

// Reject participation in a multisig scheme
multisigRouter.post('/:address/reject', async (c) => {
	const { signature } = await c.req.json();
	const { address } = c.req.param();

	const pubKey =
		getPublicKeyFromSerializedSignature(signature);

	// Validate signature with rejection-specific message
	await validatePersonalMessage(
		pubKey,
		signature,
		`Rejecting multisig invitation ${address}`,
	);

	const multisig = await getMultisig(address);

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
		.update(SchemaMultisigMembers)
		.set({ isRejected: true })
		.where(
			and(
				eq(SchemaMultisigMembers.multisigAddress, address),
				eq(
					SchemaMultisigMembers.publicKey,
					pubKey.toSuiPublicKey(),
				),
			),
		);

	return c.json({
		message: 'Multisig invitation rejected and removed',
		address,
	});
});

// Add an external proposer for a multisig address
multisigRouter.post('/:address/add-proposer', async (c) => {
	const { signature, proposer, expiry } =
		await c.req.json();
	const { address } = c.req.param();

	// Validate the expiry time of the signature.
	validateExpiry(expiry);

	if (!isValidSuiAddress(proposer))
		throw new CommonError('InvalidAddress');

	// Gets the sender's public key based on the signature.
	const publicKey =
		getPublicKeyFromSerializedSignature(signature);

	if (!(await isMultisigMember(address, publicKey)))
		throw new ApiAuthError('NotAMultisigMember');

	// Validate the signature.
	await validatePersonalMessage(
		publicKey,
		signature,
		PersonalMessages.addMultisigProposer(
			proposer,
			address,
			expiry,
		),
	);

	// Add the proposer to the multisig.
	await db.transaction(
		async (tx) => {
			const existingProposers =
				await tx.query.SchemaMultisigProposers.findMany({
					columns: { address: true },
					where: and(
						eq(
							SchemaMultisigProposers.multisigAddress,
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

			await tx.insert(SchemaMultisigProposers).values({
				multisigAddress: address,
				address: proposer,
				addedBy: publicKey.toSuiAddress(),
			});
		},
		{ isolationLevel: 'repeatable read' },
	);

	return c.json({ success: true });
});

multisigRouter.post(
	'/:address/remove-proposer',
	async (c) => {
		const { signature, proposer, expiry } =
			await c.req.json();
		const { address } = c.req.param();

		// Validate the expiry time of the signature.
		validateExpiry(expiry);

		const publicKey =
			getPublicKeyFromSerializedSignature(signature);

		if (!(await isMultisigMember(address, publicKey)))
			throw new ApiAuthError('NotAMultisigMember');

		await validatePersonalMessage(
			publicKey,
			signature,
			PersonalMessages.removeMultisigProposer(
				proposer,
				address,
				expiry,
			),
		);

		// Remove the proposer from the multisig, removing all pending transactions from the proposer.
		await db.transaction(async (tx) => {
			// Cancel all pending transactions from the proposer.
			await tx
				.update(SchemaProposals)
				.set({ status: ProposalStatus.CANCELLED })
				.where(
					and(
						eq(SchemaProposals.multisigAddress, address),
						eq(SchemaProposals.proposerAddress, proposer),
						eq(
							SchemaProposals.status,
							ProposalStatus.PENDING,
						),
					),
				);

			await tx
				.delete(SchemaMultisigProposers)
				.where(
					and(
						eq(
							SchemaMultisigProposers.multisigAddress,
							address,
						),
						eq(SchemaMultisigProposers.address, proposer),
					),
				);
		});

		return c.json({ success: true });
	},
);

export default multisigRouter;
