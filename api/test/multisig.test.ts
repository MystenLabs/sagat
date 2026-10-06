// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import {
	ApiTestFramework,
	newUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

describe('Multisig API', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	test('creates a multisig', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(3);

		const multisig = await session.createMultisig(
			users,
			2,
			{
				name: 'My Test Multisig',
			},
		);

		expect(multisig).toMatchObject({
			threshold: 2,
			name: 'My Test Multisig',
			totalMembers: 3,
		});
	});

	test('rejects invalid thresholds', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);

		await expect(
			session.createMultisig(users, 3),
		).rejects.toThrow('Threshold must be less than');
		await expect(
			session.createMultisig(users, 0),
		).rejects.toThrow(
			'Threshold must be greater or equal to 1',
		);
	});

	test('registers the public keys of members who never connected', async () => {
		const session = framework.createSession();
		const alice = newUser();
		const bob = newUser();
		await session.connectUser(alice);

		await session.createMultisig([alice, bob], 2);

		const info = await session.client.getAddressInfo(
			bob.address,
		);
		expect(info.publicKey).toBe(bob.publicKey);
	});

	test('becomes verified once every member accepts', async () => {
		const session = framework.createSession();
		const alice = newUser();
		const bob = newUser();
		await session.connectUser(alice);

		const { address } = await session.createMultisig(
			[alice, bob],
			2,
		);
		expect(
			(await session.client.getMultisig(address))
				.isVerified,
		).toBe(false);

		await session.acceptMultisig(bob, address);
		const details =
			await session.client.getMultisig(address);
		expect(details.isVerified).toBe(true);
		expect(details.members).toHaveLength(2);
	});

	test('non-members cannot accept or reject', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);
		const outsider = newUser();
		const { address } = await session.createMultisig(
			users,
			2,
		);

		await expect(
			session.acceptMultisig(outsider, address),
		).rejects.toThrow(
			'You are not a member of this multisig',
		);
		await expect(
			session.rejectMultisig(outsider, address),
		).rejects.toThrow(
			'You are not a member of this multisig',
		);
	});

	test('rejected invitations are only listed when asked for', async () => {
		const session = framework.createSession();
		const creator = newUser();
		const invitee = newUser();
		await session.connectUser(creator);
		const { address } = await session.createMultisig(
			[creator, invitee],
			2,
		);
		await session.connectUser(invitee);

		const invitations = async (showRejected = false) =>
			(
				await session.client.getInvitations(
					invitee.publicKey,
					{ showRejected },
				)
			).map((m) => m.address);

		expect(await invitations()).toEqual([address]);

		await session.rejectMultisig(invitee, address);
		expect(await invitations()).toEqual([]);
		expect(await invitations(true)).toEqual([address]);
	});

	test('lists the multisigs of the connected members', async () => {
		const { session, multisig } =
			await framework.createVerifiedMultisig(2, 2);

		const connections =
			await session.client.getMultisigConnections();

		expect(
			Object.values(connections)
				.flat()
				.map((m) => m.address),
		).toContain(multisig.address);
	});
});
