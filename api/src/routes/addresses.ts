// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { db } from '../db';
import {
	SchemaAccountSignerSets,
	SchemaAddresses,
	SchemaSignerSetMembers,
} from '../db/schema';
import { ValidationError } from '../errors';
import {
	toLegacyMultisigWithMembers,
	type LegacyMultisigWithMembers,
	type SignerSetOrigin,
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

type LegacyMultisigRow = SignerSetOrigin & {
	address: string;
};

// Signer sets with a member matching `where`, with who drafted them and
// when. Legacy clients only see signer sets that have their account's link
// row for the original composition, `(A, A)` in `account_signer_sets`: a
// signer set drafted for another account would otherwise show up as a
// standalone multisig.
const selectLegacyMultisigs = async (
	where: SQL | undefined,
): Promise<LegacyMultisigRow[]> =>
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

// Signer sets in the legacy multisig shape, with their account's proposers.
const expandLegacyMultisigs = async (
	rows: LegacyMultisigRow[],
): Promise<LegacyMultisigWithMembers[]> => {
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
		return toLegacyMultisigWithMembers(
			signerSet,
			accountProposers,
			keyLabels,
			origins.get(signerSet.address) ?? null,
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

		// Step 1: Find multisigs that the given publicKeys belong to
		const multisigs = await selectLegacyMultisigs(
			and(...whereConditions.filter((x) => !!x)),
		);

		// Step 2: Expand multisigs to full objects with all members
		const multisigsWithMembers =
			await expandLegacyMultisigs(multisigs);

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

		// Step 1: Find multisigs for this public key's invitations
		const multisigs = await selectLegacyMultisigs(
			and(...whereConditions.filter((x) => !!x)),
		);

		// Step 2: Expand multisigs to full objects with all members
		return c.json(await expandLegacyMultisigs(multisigs));
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
