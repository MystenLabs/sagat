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

describe('Addresses API', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	test('connecting registers every address in the session, and registering again is fine', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);

		await session.client.registerAddresses();

		for (const user of users) {
			const info = await session.client.getAddressInfo(
				user.address,
			);
			expect(info.publicKey).toBe(user.publicKey);
		}
	});

	test('looking up an unregistered address fails', async () => {
		const { session } =
			await framework.createAuthenticatedSession(1);

		await expect(
			session.client.getAddressInfo(`0x${'a'.repeat(64)}`),
		).rejects.toThrow(
			'Address is not registered in the system.',
		);
	});

	test('registering requires a session', async () => {
		await expect(
			framework.createSession().client.registerAddresses(),
		).rejects.toThrow('Unauthorized');
	});
});
