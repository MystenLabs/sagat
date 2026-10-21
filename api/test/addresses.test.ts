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

		expect(await session.v1.registerAddresses()).toEqual({
			success: true,
		});
		expect(await session.v1.registerAddresses()).toEqual({
			success: true,
		});

		for (const user of users) {
			const info = await session.v1.getAddressInfo(
				user.address,
			);
			expect(info.publicKey).toBe(user.publicKey);
		}
	});

	test('registering extra keys registers them too, and skips keys that do not parse', async () => {
		const { session } =
			await framework.createAuthenticatedSession(1);
		const extra = newUser();

		await session.v1.registerPublicKeys([
			extra.publicKey,
			'not-a-key',
		]);

		expect(
			await session.v1.getAddressInfo(extra.address),
		).toEqual({
			publicKey: extra.publicKey,
			address: extra.address,
		});
	});

	test('looking up an unregistered address fails', async () => {
		const { session } =
			await framework.createAuthenticatedSession(1);

		await expect(
			session.v1.getAddressInfo(`0x${'a'.repeat(64)}`),
		).rejects.toMatchObject({
			status: 400,
			message: 'Address is not registered in the system.',
		});
	});

	test('looking up a malformed address fails without a session', async () => {
		await expect(
			framework
				.createSession()
				.v1.getAddressInfo('not-an-address'),
		).rejects.toMatchObject({
			status: 400,
			message: 'address: Must be a valid Sui address.',
		});
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

	test('registering requires a session', async () => {
		await expect(
			framework.createSession().v1.registerAddresses(),
		).rejects.toMatchObject({
			status: 401,
			message: 'Unauthorized',
		});
	});
});
