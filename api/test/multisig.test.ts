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

	test('rejects weights outside 1 to 255', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);

		await expect(
			session.createMultisig(users, 1, { weights: [0, 1] }),
		).rejects.toThrow('Weights must be greater than 0');
		await expect(
			session.createMultisig(users, 1, {
				weights: [256, 1],
			}),
		).rejects.toThrow('Weights must be less than 256');
	});

	test('rejects fewer than 2 or more than 10 members', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(1);
		const tooMany = [
			...users,
			...Array.from({ length: 10 }, newUser),
		];

		await expect(
			session.createMultisig(users, 1),
		).rejects.toThrow(
			'Addresses cannot be more than 10 or less than 2',
		);
		await expect(
			session.createMultisig(tooMany, 1),
		).rejects.toThrow(
			'Addresses cannot be more than 10 or less than 2',
		);
	});

	test('rejects weights that do not match the members', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);

		await expect(
			session.createMultisig(users, 1, { weights: [1] }),
		).rejects.toThrow(
			'Addresses and weights must be the same length',
		);
	});

	test('rejects creating the same multisig twice', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);
		await session.createMultisig(users, 2);

		await expect(
			session.createMultisig(users, 2),
		).rejects.toThrow('Data already exists');
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
		expect(details).toMatchObject({
			address,
			threshold: 2,
			isVerified: true,
			totalMembers: 2,
		});
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

	describe('key labels', () => {
		const labelsOf = (
			members: {
				publicKey: string;
				label: string | null;
			}[],
		) => members.map((m) => m.label);

		test('members have no label unless one was given', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const multisig = await session.createMultisig(
				users,
				2,
			);
			expect(labelsOf(multisig.members)).toEqual([
				null,
				null,
			]);

			const fetched = await session.client.getMultisig(
				multisig.address,
			);
			expect(labelsOf(fetched.members)).toEqual([
				null,
				null,
			]);
		});

		test('labels given at creation are stored per key and shown everywhere members are', async () => {
			const session = framework.createSession();
			const creator = newUser();
			const invitee = newUser();
			await session.connectUser(creator);
			const multisig = await session.createMultisig(
				[creator, invitee],
				2,
				{ labels: ["Alice's Ledger", null] },
			);
			expect(labelsOf(multisig.members)).toEqual([
				"Alice's Ledger",
				null,
			]);

			const fetched = await session.client.getMultisig(
				multisig.address,
			);
			expect(labelsOf(fetched.members)).toEqual([
				"Alice's Ledger",
				null,
			]);

			// The invitee sees the labels in the invitation.
			await session.connectUser(invitee);
			const [invitation] =
				await session.client.getInvitations(
					invitee.publicKey,
				);
			expect(labelsOf(invitation.members)).toEqual([
				"Alice's Ledger",
				null,
			]);

			// And in the connections listing once accepted.
			await session.acceptMultisig(
				invitee,
				multisig.address,
			);
			const connections =
				await session.client.getMultisigConnections();
			const listed = Object.values(connections)
				.flat()
				.find((m) => m.address === multisig.address);
			expect(labelsOf(listed!.members)).toEqual([
				"Alice's Ledger",
				null,
			]);
		});

		test('labels are trimmed and blank labels mean no label', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const multisig = await session.createMultisig(
				users,
				2,
				{
					labels: ['  Ops key  ', '   '],
				},
			);
			expect(labelsOf(multisig.members)).toEqual([
				'Ops key',
				null,
			]);
		});

		test('labels are per multisig, not per key', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const first = await session.createMultisig(users, 2, {
				labels: ['Treasury signer', null],
			});
			const second = await session.createMultisig(
				users,
				1,
				{
					labels: [null, 'Ops signer'],
				},
			);
			expect(
				labelsOf(
					(await session.client.getMultisig(first.address))
						.members,
				),
			).toEqual(['Treasury signer', null]);
			expect(
				labelsOf(
					(await session.client.getMultisig(second.address))
						.members,
				),
			).toEqual([null, 'Ops signer']);
		});

		test('rejects labels that do not line up with the members or are too long', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			await expect(
				session.createMultisig(users, 2, {
					labels: ['Only one'],
				}),
			).rejects.toThrow('one entry per public key');
			await expect(
				session.createMultisig(users, 2, {
					labels: ['x'.repeat(256), null],
				}),
			).rejects.toThrow('at most 255 characters');
			await expect(
				session.createMultisig(users, 2, {
					// @ts-expect-error a number is not a label
					labels: [1, null],
				}),
			).rejects.toThrow('string or null');
		});
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
