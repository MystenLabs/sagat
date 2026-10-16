// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The legacy listings inner-join `accounts`: a signer set without an account
// row (a draft, or a signer set added to another account) is not a legacy
// multisig.

import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '../src/db';
import {
	SchemaAccountSignerSets,
	SchemaSignerSetMembers,
	SchemaSignerSets,
} from '../src/db/schema';
import {
	ApiTestFramework,
	newUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

describe('Legacy listings', () => {
	test('a signer set without an account row is not a legacy multisig', async () => {
		const framework = new ApiTestFramework(
			await createTestApp(),
		);
		const {
			session,
			users: [u1],
		} = await framework.createAuthenticatedSession(1);
		await session.client.registerAddresses();
		// u2 connects separately, so it is invited rather than auto-accepted.
		const u2 = newUser();
		const invitee = framework.createSession();
		await invitee.connectUser(u2);
		await invitee.client.registerAddresses();

		// A regular multisig, listed as usual.
		const listed = (
			await session.createMultisig([u1, u2], 2)
		).address;

		// The same members in a signer set with no account row.
		const draft = MultiSigPublicKey.fromPublicKeys({
			threshold: 1,
			publicKeys: [u1, u2].map((m) => ({
				publicKey: m.keypair.getPublicKey(),
				weight: 1,
			})),
		}).toSuiAddress();
		await db.insert(SchemaSignerSets).values({
			address: draft,
			threshold: 1,
			isVerified: false,
		});
		await db.insert(SchemaSignerSetMembers).values([
			{
				signerSetAddress: draft,
				publicKey: u1.publicKey,
				order: 0,
				isAccepted: true,
			},
			{
				signerSetAddress: draft,
				publicKey: u2.publicKey,
				order: 1,
			},
		]);

		const connections = Object.values(
			await session.client.getMultisigConnections(),
		)
			.flat()
			.map((m) => m.address);
		expect(connections).toContain(listed);
		expect(connections).not.toContain(draft);

		const invitations = (
			await invitee.client.getInvitations(u2.publicKey)
		).map((m) => m.address);
		expect(invitations).toContain(listed);
		expect(invitations).not.toContain(draft);

		await expect(
			session.client.getMultisig(draft),
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
