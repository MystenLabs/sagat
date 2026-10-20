// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The legacy listings require the account's link row for its original
// composition, `(A, A)` in `account_signer_sets`: a signer set without one (a
// draft, or a signer set added to another account) is not a legacy multisig.

import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '../src/db';
import {
	SchemaAccounts,
	SchemaAccountSignerSets,
	SchemaSignerSetMembers,
	SchemaSignerSets,
} from '../src/db/schema';
import {
	ApiTestFramework,
	newUser,
	type TestUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

// A 1-of-2 signer set of `[accepted, invited]` inserted directly, with no
// `account_signer_sets` row.
const insertSignerSet = async (
	accepted: TestUser,
	invited: TestUser,
) => {
	const address = MultiSigPublicKey.fromPublicKeys({
		threshold: 1,
		publicKeys: [accepted, invited].map((m) => ({
			publicKey: m.keypair.getPublicKey(),
			weight: 1,
		})),
	}).toSuiAddress();
	await db.insert(SchemaSignerSets).values({
		address,
		threshold: 1,
		isVerified: false,
	});
	await db.insert(SchemaSignerSetMembers).values([
		{
			signerSetAddress: address,
			publicKey: accepted.publicKey,
			order: 0,
			isAccepted: true,
		},
		{
			signerSetAddress: address,
			publicKey: invited.publicKey,
			order: 1,
		},
	]);
	return address;
};

// Two users: `u1` connected in `session`, `u2` in `invitee`, so `u2` is
// invited rather than auto-accepted.
const setupUsers = async () => {
	const framework = new ApiTestFramework(
		await createTestApp(),
	);
	const {
		session,
		users: [u1],
	} = await framework.createAuthenticatedSession(1);
	await session.client.registerAddresses();
	const u2 = newUser();
	const invitee = framework.createSession();
	await invitee.connectUser(u2);
	await invitee.client.registerAddresses();
	return { session, invitee, u1, u2 };
};

// The addresses `u1` and `u2` see in their connections and invitations.
const listedFor = async ({
	session,
	invitee,
	u2,
}: Awaited<ReturnType<typeof setupUsers>>) => ({
	connections: Object.values(
		await session.client.getMultisigConnections(),
	)
		.flat()
		.map((m) => m.address),
	invitations: (
		await invitee.client.getInvitations(u2.publicKey)
	).map((m) => m.address),
});

describe('Legacy listings', () => {
	test('a signer set without its account link row is not a legacy multisig', async () => {
		const users = await setupUsers();
		const { session, u1, u2 } = users;

		// A regular multisig, listed as usual.
		const listed = (
			await session.createMultisig([u1, u2], 2)
		).address;

		// The same members in a signer set with no account and no link row.
		const draft = await insertSignerSet(u1, u2);

		const { connections, invitations } =
			await listedFor(users);
		expect(connections).toContain(listed);
		expect(connections).not.toContain(draft);
		expect(invitations).toContain(listed);
		expect(invitations).not.toContain(draft);

		await expect(
			session.client.getMultisig(draft),
		).rejects.toThrow('not found');
	});

	test('an account row without its link row is not a legacy multisig', async () => {
		const users = await setupUsers();
		const { session, u1, u2 } = users;

		// The account exists, but nothing links it to its own composition.
		const address = await insertSignerSet(u1, u2);
		await db.insert(SchemaAccounts).values({ address });

		const { connections, invitations } =
			await listedFor(users);
		expect(connections).not.toContain(address);
		expect(invitations).not.toContain(address);

		await expect(
			session.client.getMultisig(address),
		).rejects.toThrow('not found');
	});

	test('the create route links the multisig to its own account', async () => {
		const framework = new ApiTestFramework(
			await createTestApp(),
		);
		const {
			session,
			users: [u1, u2],
		} = await framework.createAuthenticatedSession(2);
		await session.client.registerAddresses();

		const { address } = await session.createMultisig(
			[u1, u2],
			2,
			{ name: 'Treasury' },
		);

		expect(
			await db
				.select()
				.from(SchemaAccountSignerSets)
				.where(
					eq(
						SchemaAccountSignerSets.accountAddress,
						address,
					),
				),
		).toEqual([
			{
				accountAddress: address,
				signerSetAddress: address,
				label: 'Treasury',
				status: 'inviting',
				draftedBy: u1.address,
				createdAt: expect.any(Date),
			},
		]);

		await session.acceptMultisig(u2, address);
		const [row] = await db
			.select()
			.from(SchemaAccountSignerSets)
			.where(
				eq(SchemaAccountSignerSets.accountAddress, address),
			);
		expect(row.status).toBe('verified');
	});
});
