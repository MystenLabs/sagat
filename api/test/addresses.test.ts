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

	test('GET /v1/addresses/:address has the legacy shape', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(1);
		await session.client.registerAddresses();
		const [user] = users;

		const v1 = await session.request(
			`/v1/addresses/${user.address}`,
		);
		expect(v1.status).toBe(200);
		expect(await v1.json()).toEqual(
			await session.client.getAddressInfo(user.address),
		);

		expect(
			await errorOf(
				await framework
					.createSession()
					.request(`/v1/addresses/0x${'a'.repeat(64)}`),
			),
		).toEqual({
			status: 400,
			body: {
				error: 'Address is not registered in the system.',
			},
		});

		expect(
			await errorOf(
				await framework
					.createSession()
					.request('/v1/addresses/not-an-address'),
			),
		).toEqual({
			status: 400,
			body: {
				error: 'address: Must be a normalized Sui address.',
			},
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
			framework.createSession().client.registerAddresses(),
		).rejects.toThrow('Unauthorized');
	});
});
