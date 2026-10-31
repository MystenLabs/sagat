// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	defaultExpiry,
	PersonalMessages,
	SagatClient,
} from '@mysten/sagat';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import {
	ApiTestFramework,
	newUser,
	sign,
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
	let app: Awaited<ReturnType<typeof createTestApp>>;
	let framework: ApiTestFramework;

	beforeEach(async () => {
		app = await createTestApp();
		framework = new ApiTestFramework(app);
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

	test('a cross-site form post is refused', async () => {
		const session = framework.createSession();
		const user = newUser();
		await session.connectUser(user);

		const response = await session.request(
			'/auth/disconnect',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'text/plain',
					Origin: 'https://other.example',
				},
			},
		);
		expect(response.status).toBe(403);
		expect(await connectedAddresses(session)).toEqual([
			user.address,
		]);
	});

	test('a script authenticates with its bearer token', async () => {
		// No cookie jar: only the bearer token can authenticate.
		const script = new SagatClient(
			'',
			'script',
			async (url, init) => app.request(url as string, init),
		);
		const user = newUser();
		const expiry = defaultExpiry();

		await script.connect(
			await sign(user, PersonalMessages.connect(expiry)),
			expiry,
		);

		const { addresses } = await script.checkAuth();
		expect(addresses.map((a) => a.address)).toEqual([
			user.address,
		]);
	});
});
