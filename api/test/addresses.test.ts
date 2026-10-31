// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import { LIMITS } from '../src/constants/limits';
import {
	ApiTestFramework,
	errorOf,
	newUser,
} from './framework/api-test-framework';
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

	test('invitations are only listed for a key the session holds', async () => {
		const { session } =
			await framework.createAuthenticatedSession(1);

		expect(
			await errorOf(
				await session.request(
					`/addresses/invitations/${encodeURIComponent(newUser().publicKey)}`,
				),
			),
		).toEqual({
			status: 400,
			body: { error: 'You are not authorized.' },
		});
	});

	test('registering refuses more extra public keys than the limit', async () => {
		const { session } =
			await framework.createAuthenticatedSession(1);

		const response = await session.post('/addresses', {
			extraPublicKeys: Array.from(
				{ length: LIMITS.maxExtraPublicKeys + 1 },
				() => newUser().publicKey,
			),
		});
		expect(response.status).toBe(400);
	});

	test('registering requires a session', async () => {
		await expect(
			framework.createSession().client.registerAddresses(),
		).rejects.toThrow('Unauthorized');
	});
});
