// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersonalMessages } from '@mysten/sagat';
import { type PublicKey } from '@mysten/sui/cryptography';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

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
} from '../db/schema';
import {
	ApiAuthError,
	CommonError,
	ValidationError,
} from '../errors';
import {
	toLegacyMultisig,
	toLegacyMultisigMember,
} from '../legacy/serializers';
import { normalizeKeyLabels } from '../services/account-keys.service';
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
	getLegacyMultisig,
	getSignerSet,
	getSignerSetOrigin,
	isSignerSetFinalized,
	isSignerSetMember,
	jwtHasSignerSetMemberAccess,
	validateMemberCount,
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
		const hasAccess = await jwtHasSignerSetMemberAccess(
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

		return c.json(await getLegacyMultisig(address));
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
			labels: rawLabels,
		}: {
			publicKeys: string[];
			weights: number[];
			threshold: number;
			name?: string;
			// Optional, aligned with `publicKeys`: what this account calls each
			// key. Unvalidated until `normalizeKeyLabels`.
			labels?: unknown;
		} = await c.req.json();

		// Pure checks first, before anything is written. The member count is
		// bounded before anything is sized by it.
		validateMemberCount(publicKeys);
		const labels = normalizeKeyLabels(
			rawLabels,
			publicKeys.length,
		);

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

		// Anyone holding a key may set up a multisig for others, but only a
		// member may name its keys: labels are shown to every member and there
		// is no route to change them, so an outsider must not get to write them.
		const callerIsMember = authorizedPubKeys.some((k) =>
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
		const database = await db.transaction(async (tx) => {
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
				authorizedPubKeys.find((k) =>
					addresses.includes(k.toSuiAddress()),
				) ?? authorizedPubKeys[0];
			const [origin] = await tx
				.insert(SchemaAccountSignerSets)
				.values({
					accountAddress: msig.address,
					signerSetAddress: msig.address,
					label: name,
					status: AccountSignerSetStatus.INVITING,
					draftedBy: creator.toSuiAddress(),
				})
				.onConflictDoNothing()
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
						isAccepted: authorizedPubKeys.some(
							(k) =>
								k.toSuiAddress() === key.toSuiAddress(),
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
				multisig: toLegacyMultisig(msig, origin ?? null),
				members: members.map((member) =>
					toLegacyMultisigMember(
						member,
						keyLabels.get(member.publicKey) ?? null,
					),
				),
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

	if (!(await isSignerSetMember(address, pubKey, false)))
		throw new ValidationError(
			'You are not a member of this multisig',
		);

	await validatePersonalMessage(
		pubKey,
		signature,
		PersonalMessages.acceptMultisigInvitation(address),
	);

	const existingConnections =
		await db.query.SchemaSignerSetMembers.findMany({
			where: and(
				eq(
					SchemaSignerSetMembers.publicKey,
					pubKey.toSuiPublicKey(),
				),
				eq(SchemaSignerSetMembers.isAccepted, true),
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
		const origin = await getSignerSetOrigin(address, tx);
		return toLegacyMultisig(msig, origin ?? null);
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

	if (!(await isSignerSetMember(address, publicKey)))
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

		if (!(await isSignerSetMember(address, publicKey)))
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

		return c.json({ success: true });
	},
);

export default multisigRouter;
