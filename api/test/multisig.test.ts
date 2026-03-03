// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { isValidSuiAddress } from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import { ApiTestFramework } from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

describe('Multisig API', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		const app = await createTestApp();
		framework = new ApiTestFramework(app);
	});

	describe('Multisig Creation', () => {
		test('creates 2-of-2 multisig', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);

			const multisig = await session.createMultisig(
				users,
				2,
			);

			expect(multisig.address).toBeDefined();
			expect(multisig.threshold).toBe(2);
			expect(isValidSuiAddress(multisig.address)).toBe(
				true,
			);
		});

		test('creates 2-of-3 multisig', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(3);

			const multisig = await session.createMultisig(
				users,
				2,
			);

			expect(multisig.address).toBeDefined();
			expect(multisig.threshold).toBe(2);
		});

		test('creates multisig with custom name', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);

			const multisig = await session.createMultisig(
				users,
				2,
				'My Test Multisig',
			);

			expect(multisig.name).toBe('My Test Multisig');
		});

		test('rejects invalid thresholds', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);

			// Threshold too high
			await expect(
				session.createMultisig(users, 3),
			).rejects.toThrow('Threshold must be less than');

			// Threshold too low
			await expect(
				session.createMultisig(users, 0),
			).rejects.toThrow(
				'Threshold must be greater or equal to 1',
			);
		});
	});

	describe('Multisig Acceptance', () => {
		test('member can accept multisig invitation', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);

			const multisig = await session.createMultisig(
				users,
				2,
			);

			// Second user accepts
			await session.acceptMultisig(
				users[1],
				multisig.address,
			);

			// Should not throw
			expect(multisig.address).toBeDefined();
		});

		test('multisig becomes verified when all members accept', async () => {
			const { multisig } =
				await framework.createVerifiedMultisig(2, 2);

			// If createVerifiedMultisig succeeded, the multisig should be verified
			expect(multisig.address).toBeDefined();
			expect(multisig.threshold).toBe(2);
		});

		test('non-member cannot accept multisig', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const outsider = session.createUser();

			const multisig = await session.createMultisig(
				users,
				2,
			);

			await expect(
				session.acceptMultisig(outsider, multisig.address),
			).rejects.toThrow('not a member');
		});
	});

	describe('Multisig Rejection', () => {
		test('unaccepted member can reject a multisig invitation', async () => {
			const session = framework.createSession();
			const creator = session.createUser();
			const invitee = session.createUser();

			// Only connect the creator — invitee stays unaccepted
			await session.connectUser(creator);
			await session.registerAddresses();

			const multisig = await session.createMultisig(
				[creator, invitee],
				2,
			);

			// Now connect the invitee so they can sign the rejection
			await session.connectUser(invitee);
			await session.registerAddresses();

			const result = await session.rejectMultisig(
				invitee,
				multisig.address,
			);
			expect(result).toBeDefined();
		});

		test('non-member cannot reject a multisig invitation', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const outsider = session.createUser();

			const multisig = await session.createMultisig(
				users,
				2,
			);

			await expect(
				session.rejectMultisig(outsider, multisig.address),
			).rejects.toThrow();
		});
	});

	describe('Multisig Details', () => {
		test('can fetch multisig details by address', async () => {
			const { session, multisig } =
				await framework.createVerifiedMultisig(2, 2);

			const details = await session
				.getStatefulClient()
				.getMultisig(multisig.address);

			expect(details).toBeDefined();
			expect(details.address).toBe(multisig.address);
			expect(details.threshold).toBe(2);
			expect(details.members).toHaveLength(2);
		});
	});

	describe('Connections & Invitations', () => {
		test('returns multisig connections for authenticated user', async () => {
			const { session, multisig } =
				await framework.createVerifiedMultisig(2, 2);

			const connections = await session
				.getStatefulClient()
				.getMultisigConnections();

			expect(connections).toBeDefined();
			const allMultisigs =
				Object.values(connections).flat();
			const found = allMultisigs.find(
				(m) => m.address === multisig.address,
			);
			expect(found).toBeDefined();
		});

		test('returns pending invitations for a public key', async () => {
			const session = framework.createSession();
			const creator = session.createUser();
			const invitee = session.createUser();

			await session.connectUser(creator);
			await session.registerAddresses();

			await session.createMultisig([creator, invitee], 2);

			// Connect invitee so the session is authorized for the query
			await session.connectUser(invitee);
			await session.registerAddresses();

			const invitations = await session
				.getStatefulClient()
				.getInvitations(invitee.publicKey);

			expect(invitations).toBeDefined();
			expect(invitations.length).toBeGreaterThanOrEqual(1);
		});

		test('rejected invitations are hidden by default', async () => {
			const session = framework.createSession();
			const creator = session.createUser();
			const invitee = session.createUser();

			await session.connectUser(creator);
			await session.registerAddresses();

			const multisig = await session.createMultisig(
				[creator, invitee],
				2,
			);

			await session.connectUser(invitee);
			await session.registerAddresses();

			await session.rejectMultisig(
				invitee,
				multisig.address,
			);

			const invitations = await session
				.getStatefulClient()
				.getInvitations(invitee.publicKey);

			const found = invitations.find(
				(i: any) => i.address === multisig.address,
			);
			expect(found).toBeUndefined();
		});

		test('rejected invitations visible with showRejected flag', async () => {
			const session = framework.createSession();
			const creator = session.createUser();
			const invitee = session.createUser();

			await session.connectUser(creator);
			await session.registerAddresses();

			const multisig = await session.createMultisig(
				[creator, invitee],
				2,
			);

			await session.connectUser(invitee);
			await session.registerAddresses();

			await session.rejectMultisig(
				invitee,
				multisig.address,
			);

			const invitations = await session
				.getStatefulClient()
				.getInvitations(invitee.publicKey, {
					showRejected: true,
				});

			expect(invitations.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('Multisig Validation', () => {
		test('public keys are auto-registered during multisig creation', async () => {
			const session = framework.createSession();
			const alice = session.createUser();
			const bob = session.createUser();

			// Connect alice but don't register addresses
			await session.connectUser(alice);

			// This should now succeed because the API auto-registers public keys
			const multisig = await session.createMultisig(
				[alice, bob],
				2,
			);

			expect(multisig.address).toBeDefined();
			expect(multisig.threshold).toBe(2);
		});
	});
});
