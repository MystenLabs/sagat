// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

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

describe('Auth API', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		const app = await createTestApp();
		framework = new ApiTestFramework(app);
	});

	describe('Basic Authentication', () => {
		test('creates JWT for single user', async () => {
			const session = framework.createSession();
			const user = session.createUser();

			await session.connectUser(user);

			expect(session.hasActiveCookie()).toBe(true);
			expect(session.getConnectedUsers()).toHaveLength(1);
			expect(session.getConnectedUsers()[0].address).toBe(
				user.address,
			);
		});

		test('adds multiple users to same session', async () => {
			const session = framework.createSession();
			const alice = session.createUser();
			const bob = session.createUser();

			await session.connectUser(alice);
			await session.connectUser(bob);

			expect(session.hasActiveCookie()).toBe(true);
			expect(session.getConnectedUsers()).toHaveLength(2);
		});

		test('does not duplicate users in session', async () => {
			const session = framework.createSession();
			const alice = session.createUser();

			await session.connectUser(alice);
			await session.connectUser(alice); // Connect same user twice

			expect(session.getConnectedUsers()).toHaveLength(1);
		});
	});

	describe('Session Management', () => {
		test('disconnect clears session state', async () => {
			const session = framework.createSession();
			const user = session.createUser();

			await session.connectUser(user);
			expect(session.hasActiveCookie()).toBe(true);

			await session.disconnect();
			expect(session.hasActiveCookie()).toBe(false);
			expect(session.getConnectedUsers()).toHaveLength(0);
		});

		test('can reconnect after disconnect', async () => {
			const session = framework.createSession();
			const user = session.createUser();

			await session.connectUser(user);
			await session.disconnect();
			await session.connectUser(user);

			expect(session.hasActiveCookie()).toBe(true);
			expect(session.getConnectedUsers()).toHaveLength(1);
		});
	});

	describe('Session Isolation', () => {
		test('different sessions are independent', async () => {
			const session1 = framework.createSession();
			const session2 = framework.createSession();

			const alice = session1.createUser();
			const bob = session2.createUser();

			await session1.connectUser(alice);
			await session2.connectUser(bob);

			expect(session1.getConnectedUsers()).toHaveLength(1);
			expect(session2.getConnectedUsers()).toHaveLength(1);
			expect(
				session1.getConnectedUsers()[0].address,
			).not.toBe(session2.getConnectedUsers()[0].address);
		});
	});
});
