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

describe('Addresses API', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		const app = await createTestApp();
		framework = new ApiTestFramework(app);
	});

	describe('Address Registration', () => {
		test('registers single user addresses', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(1);

			// Verify session contains the correct user
			const connectedUsers = session.getConnectedUsers();
			expect(connectedUsers).toHaveLength(1);
			expect(connectedUsers[0].address).toBe(
				users[0].address,
			);
			expect(connectedUsers[0].publicKey).toBe(
				users[0].publicKey,
			);
		});

		test('registers multiple user addresses in same session', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(3);

			// Verify session contains all connected users
			const connectedUsers = session.getConnectedUsers();
			expect(connectedUsers).toHaveLength(3);

			// Verify all users from session match the created users
			const sessionAddresses = connectedUsers
				.map((u) => u.address)
				.sort();
			const createdAddresses = users
				.map((u) => u.address)
				.sort();
			expect(sessionAddresses).toEqual(createdAddresses);

			// All users should have unique addresses
			const uniqueAddresses = new Set(sessionAddresses);
			expect(uniqueAddresses.size).toBe(3);
		});

		test('handles registration for same user multiple times', async () => {
			const session = framework.createSession();
			const user = session.createUser();

			await session.connectUser(user);
			await session.registerAddresses();

			// Register again - should not fail
			await session.registerAddresses();

			expect(session.getConnectedUsers()).toHaveLength(1);
		});
	});

	describe('Address Lookup', () => {
		test('can look up registered address', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(1);
			const user = users[0];

			// Verify the session knows about this address
			const connectedUsers = session.getConnectedUsers();
			const foundUser = connectedUsers.find(
				(u) => u.address === user.address,
			);
			expect(foundUser).toBeDefined();
			expect(foundUser?.publicKey).toBe(user.publicKey);
			expect(isValidSuiAddress(user.address)).toBe(true);
		});
	});

	describe('Authentication Requirements', () => {
		test('requires authentication for address registration', async () => {
			const session = framework.createSession();

			// Try to register without connecting/authenticating first
			expect(session.registerAddresses()).rejects.toThrow();
		});
	});
});
