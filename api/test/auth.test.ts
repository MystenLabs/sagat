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
	type TestSession,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

const connectedAddresses = async (session: TestSession) =>
	(await session.client.checkAuth()).addresses
		.map((a) => a.address)
		.sort();

describe('Auth API', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	test('connecting adds each user to the session once', async () => {
		const session = framework.createSession();
		const alice = newUser();
		const bob = newUser();

		await session.connectUser(alice);
		await session.connectUser(bob);
		await session.connectUser(alice);

		expect(await connectedAddresses(session)).toEqual(
			[alice.address, bob.address].sort(),
		);
	});

	test('disconnecting ends the session', async () => {
		const session = framework.createSession();
		const user = newUser();

		await session.connectUser(user);
		await session.client.disconnect();
		await expect(
			session.client.checkAuth(),
		).rejects.toThrow('Unauthorized');

		await session.connectUser(user);
		expect(await connectedAddresses(session)).toEqual([
			user.address,
		]);
	});
});
