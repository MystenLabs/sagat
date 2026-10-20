// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { db } from '../db';
import {
	SchemaAccounts,
	SchemaAddresses,
	SchemaSignerSetMembers,
} from '../db/schema';
import { ValidationError } from '../errors';
import {
	toLegacyMultisigWithMembers,
	type LegacyMultisigWithMembers,
} from '../legacy/serializers';
import { AccountKeyLabelsDataLoader } from '../loaders/account-keys.loader';
import { AccountProposersDataLoader } from '../loaders/account-proposers.loader';
import {
	expandSignerSetsWithMembers,
	registerPublicKeys,
} from '../services/addresses.service';
import {
	authMiddleware,
	type AuthEnv,
} from '../services/auth.service';
import { parsePublicKey } from '../utils/pubKey';

const addressesRouter = new Hono();

// Signer set addresses with a member matching `where`. Legacy clients only
// see signer sets that are also accounts: a signer set drafted for another
// account would otherwise show up as a standalone multisig.
const selectLegacyMultisigAddresses = async (
	where: SQL | undefined,
) =>
	(
		await db
			.selectDistinct({
				address: SchemaSignerSetMembers.signerSetAddress,
			})
			.from(SchemaSignerSetMembers)
			.innerJoin(
				SchemaAccounts,
				eq(
					SchemaAccounts.address,
					SchemaSignerSetMembers.signerSetAddress,
				),
			)
			.where(where)
	).map((m) => m.address);

// Signer sets in the legacy multisig shape, with their account's proposers.
const expandLegacyMultisigs = async (
	addresses: string[],
): Promise<LegacyMultisigWithMembers[]> => {
	const signerSets =
		await expandSignerSetsWithMembers(addresses);
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
		return toLegacyMultisigWithMembers(
			signerSet,
			accountProposers,
			keyLabels,
		);
	});
};

/**
 * Register addresses from authenticated JWT context.
 * No signature required - uses JWT authentication.
 */
addressesRouter.post(
	'/',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const publicKeys = c.get('publicKeys');
		const { extraPublicKeys } = await c.req
			.json()
			.catch(() => ({ extraPublicKeys: [] }));

		// Parse extra public keys using the existing utility
		const parsedExtraKeys = extraPublicKeys
			.map((keyStr: string) => {
				try {
					return parsePublicKey(keyStr);
				} catch (error) {
					// eslint-disable-next-line no-console
					console.warn(
						'Failed to parse public key:',
						keyStr,
						error,
					);
					return null;
				}
			})
			.filter(Boolean);

		// Combine all public keys
		const allPublicKeys = [
			...publicKeys,
			...parsedExtraKeys,
		];

		// Register all public keys using the service
		await registerPublicKeys(allPublicKeys);

		return c.json({ success: true });
	},
);

// Return a list of all accepted multisigs that the JWT has active.
addressesRouter.get(
	'/connections',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const publicKeys = c.get('publicKeys');

		const whereConditions = [
			inArray(
				SchemaSignerSetMembers.publicKey,
				publicKeys.map((pubKey) => pubKey.toSuiPublicKey()),
			),
			eq(SchemaSignerSetMembers.isAccepted, true),
			eq(SchemaSignerSetMembers.isRejected, false),
		];

		// Step 1: Find multisig addresses that the given publicKeys belong to
		const multisigAddresses =
			await selectLegacyMultisigAddresses(
				and(...whereConditions.filter((x) => !!x)),
			);

		// Step 2: Expand multisigs to full objects with all members
		const multisigsWithMembers =
			await expandLegacyMultisigs(multisigAddresses);

		const grouped: Record<
			string,
			LegacyMultisigWithMembers[]
		> = {};

		for (const pubkey of publicKeys) {
			const pubKeyBase64 = pubkey.toSuiPublicKey();
			// shouldnt really happen
			if (grouped[pubKeyBase64]) continue;

			// Only include accepted multisigs for individual public keys.
			grouped[pubKeyBase64] = multisigsWithMembers.filter(
				(m) =>
					m.members.some(
						(m) =>
							m.publicKey === pubKeyBase64 && m.isAccepted,
					),
			);
		}

		return c.json(grouped);
	},
);

// Get invitations for a specific public key
addressesRouter.get(
	'/invitations/:publicKey',
	authMiddleware,
	async (c: Context<AuthEnv>) => {
		const publicKeys = c.get('publicKeys');
		const { showRejected } = c.req.query();
		const { publicKey } = c.req.param();

		if (
			!publicKeys.some(
				(pubKey) => pubKey.toSuiPublicKey() === publicKey,
			)
		)
			throw new ValidationError('You are not authorized.');

		const whereConditions = [
			eq(SchemaSignerSetMembers.publicKey, publicKey),
			showRejected === 'true'
				? eq(SchemaSignerSetMembers.isRejected, true)
				: and(
						eq(SchemaSignerSetMembers.isAccepted, false),
						eq(SchemaSignerSetMembers.isRejected, false),
					),
		];

		// Step 1: Find multisig addresses for this public key's invitations
		const multisigAddresses =
			await selectLegacyMultisigAddresses(
				and(...whereConditions.filter((x) => !!x)),
			);

		// Step 2: Expand multisigs to full objects with all members
		return c.json(
			await expandLegacyMultisigs(multisigAddresses),
		);
	},
);

// Get the public key for an address registered in the system.
// IMPORTANT: Keep this route last as it's a catch-all for any /:address pattern
addressesRouter.get('/:address', async (c) => {
	const { address } = c.req.param();

	const addr = await db.query.SchemaAddresses.findFirst({
		where: eq(SchemaAddresses.address, address),
	});

	if (!addr)
		throw new ValidationError(
			'Address is not registered in the system.',
		);

	return c.json(addr);
});

export default addressesRouter;
