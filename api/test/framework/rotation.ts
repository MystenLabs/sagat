// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Writes what the rotation wizard (drafting a signer set for an account)
 * and the alias refresh (mirroring the on-chain alias set) will write,
 * straight into the database. Neither has a route yet; when they land,
 * tests should move to them. Everything else in a rotation test goes
 * through the `/v1` routes with real signatures.
 */

import { signerSetPublicKey } from '@mysten/sagat';
import { and, eq } from 'drizzle-orm';

import {
	AccountSignerSetStatus,
	SchemaAccountAliases,
	SchemaAccountAliasState,
	SchemaAccountSignerSets,
	SchemaAddresses,
	SchemaSignerSetMembers,
	SchemaSignerSets,
} from '../../src/db/schema';
import { type SuiNetwork } from '../../src/utils/client';
import {
	createTestApp,
	testDatabase,
} from '../setup/shared-test-setup';
import {
	ApiTestFramework,
	newUser,
	type TestSession,
	type TestUser,
} from './api-test-framework';

type LinkOptions = {
	label?: string | null;
	status?: AccountSignerSetStatus;
	// Who drafted it. Defaults to the account address.
	draftedBy?: string;
};

/** Links an existing signer set to an account, as drafting does. */
export async function linkSignerSet(
	accountAddress: string,
	signerSetAddress: string,
	{
		label = null,
		status = AccountSignerSetStatus.INVITING,
		draftedBy = accountAddress,
	}: LinkOptions = {},
) {
	await testDatabase()
		.insert(SchemaAccountSignerSets)
		.values({
			accountAddress,
			signerSetAddress,
			label,
			status,
			draftedBy,
		});
}

/** The address of `members`, each of weight 1, with `threshold`. */
const signerSetAddress = (
	members: TestUser[],
	threshold: number,
) =>
	signerSetPublicKey({
		threshold,
		members: members.map((m, order) => ({
			publicKey: m.publicKey,
			weight: 1,
			order,
		})),
	}).toSuiAddress();

/**
 * Drafts a signer set for an account: the composition with its members
 * invited (or accepted, for `accepted`), linked to the account, without an
 * account of its own. Every member has weight 1. An existing composition
 * is reused and only linked. Returns its address.
 */
export async function draftSignerSet(
	accountAddress: string,
	members: TestUser[],
	threshold: number,
	{
		accepted = [],
		...link
	}: LinkOptions & {
		// Members that accept right away, like carried-over keys.
		accepted?: TestUser[];
	} = {},
) {
	const db = testDatabase();
	const address = signerSetAddress(members, threshold);
	const existing =
		await db.query.SchemaSignerSets.findFirst({
			where: eq(SchemaSignerSets.address, address),
		});
	if (!existing) {
		await db
			.insert(SchemaAddresses)
			.values(
				members.map((m) => ({
					publicKey: m.publicKey,
					address: m.address,
				})),
			)
			.onConflictDoNothing();
		await db.insert(SchemaSignerSets).values({
			address,
			threshold,
			isVerified: members.every((m) =>
				accepted.includes(m),
			),
		});
		await db.insert(SchemaSignerSetMembers).values(
			members.map((m, order) => ({
				signerSetAddress: address,
				publicKey: m.publicKey,
				weight: 1,
				isAccepted: accepted.includes(m),
				order,
			})),
		);
	}
	await linkSignerSet(accountAddress, address, link);
	return address;
}

/**
 * Replaces the mirror of an account's alias set on a network, as a refresh
 * that read it from chain would. `exists: false` is an account that never
 * called `enable` there.
 */
export async function setAliasMirror(
	accountAddress: string,
	network: SuiNetwork,
	{
		exists = true,
		aliases = [],
		observedAt = new Date(),
		observedVersion = exists ? 1 : null,
	}: {
		exists?: boolean;
		aliases?: string[];
		observedAt?: Date;
		observedVersion?: number | null;
	},
) {
	const db = testDatabase();
	const pair = (
		table:
			| typeof SchemaAccountAliases
			| typeof SchemaAccountAliasState,
	) =>
		and(
			eq(table.accountAddress, accountAddress),
			eq(table.network, network),
		);
	await db.transaction(async (tx) => {
		await tx
			.delete(SchemaAccountAliases)
			.where(pair(SchemaAccountAliases));
		await tx
			.delete(SchemaAccountAliasState)
			.where(pair(SchemaAccountAliasState));
		await tx.insert(SchemaAccountAliasState).values({
			accountAddress,
			network,
			exists,
			observedVersion,
			observedAt,
		});
		if (aliases.length > 0)
			await tx.insert(SchemaAccountAliases).values(
				aliases.map((aliasAddress) => ({
					accountAddress,
					network,
					aliasAddress,
				})),
			);
	});
}

/** Removes every mirror row of an account, on every network. */
export async function clearAliasMirror(
	accountAddress: string,
) {
	const db = testDatabase();
	await db
		.delete(SchemaAccountAliases)
		.where(
			eq(
				SchemaAccountAliases.accountAddress,
				accountAddress,
			),
		);
	await db
		.delete(SchemaAccountAliasState)
		.where(
			eq(
				SchemaAccountAliasState.accountAddress,
				accountAddress,
			),
		);
}

/** The link row of a signer set in an account. */
export const linkStatus = async (
	accountAddress: string,
	signerSetAddress: string,
) =>
	(
		await testDatabase().query.SchemaAccountSignerSets.findFirst(
			{
				where: and(
					eq(
						SchemaAccountSignerSets.accountAddress,
						accountAddress,
					),
					eq(
						SchemaAccountSignerSets.signerSetAddress,
						signerSetAddress,
					),
				),
			},
		)
	)?.status;

/**
 * The account most rotation tests start from:
 *
 * - `A`, the account, with its original signer set `S1` = k1, k2, k3,
 *   2-of-3, all accepted (`S1 === A`).
 * - `S2` = k3, k4 (`s2Threshold`-of-2), drafted for A as "Operations" and
 *   verified (k3 carried over, k4 accepted through the route). Linked, but
 *   valid nowhere until a test puts it in an alias set.
 * - `S3` = k5, k6, 2-of-2, drafted for A as "Board" and still a draft.
 *
 * No alias mirror rows are written. `as(user)` is a session holding that
 * key only, for checks that depend on who is asking. Starts from an empty
 * database, with its own `framework`.
 */
export async function rotationScenario({
	s2Threshold = 2,
	fund = false,
}: { s2Threshold?: number; fund?: boolean } = {}) {
	const framework = new ApiTestFramework(
		await createTestApp(),
	);
	const keys = Array.from({ length: 6 }, newUser);
	const [k1, k2, k3, k4, k5, k6] = keys;

	const sessions = new Map<TestUser, TestSession>();
	const as = async (user: TestUser) => {
		let session = sessions.get(user);
		if (!session) {
			session = framework.createSession();
			await session.connectUser(user);
			sessions.set(user, session);
		}
		return session;
	};

	const creator = framework.createSession();
	for (const key of [k1, k2, k3])
		await creator.connectUser(key);
	const account = await creator.createSignerSet(
		[k1, k2, k3],
		2,
		{
			name: 'Treasury',
			labels: ["k1's Ledger", null, 'k3 in Treasury'],
			fund,
		},
	);
	const A = account.address;
	// Every key accepted on creation; an accept finalizes the set.
	await creator.acceptSignerSet(k2, A);

	const S2 = await draftSignerSet(
		A,
		[k3, k4],
		s2Threshold,
		{
			label: 'Operations',
			accepted: [k3],
			draftedBy: k1.address,
		},
	);
	await creator.acceptSignerSet(k4, S2);

	const S3 = await draftSignerSet(A, [k5, k6], 2, {
		label: 'Board',
		status: AccountSignerSetStatus.DRAFT,
		draftedBy: k1.address,
	});

	return {
		framework,
		A,
		S1: A,
		S2,
		S3,
		k1,
		k2,
		k3,
		k4,
		k5,
		k6,
		creator,
		as,
	};
}

export type RotationScenario = Awaited<
	ReturnType<typeof rotationScenario>
>;

/**
 * "Payroll", a second account: `owner` and the scenario's k3, 1-of-2, with
 * its own label for k3, created by a session holding both keys.
 */
export async function secondAccount(s: RotationScenario) {
	const owner = newUser();
	const session = s.framework.createSession();
	await session.connectUser(owner);
	await session.connectUser(s.k3);
	const { address: B } = await session.createSignerSet(
		[owner, s.k3],
		1,
		{
			name: 'Payroll',
			labels: [null, 'k3 in Payroll'],
		},
	);
	return { B, owner };
}
