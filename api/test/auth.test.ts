// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	defaultExpiry,
	PersonalMessages,
	SagatClient,
	type AuthCheckResponse,
} from '@mysten/sagat';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import { CommonErrors } from '../src/errors';
import {
	ApiTestFramework,
	errorOf,
	newUser,
	sign,
	type TestSession,
	type TestUser,
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

	// The user's session cookie under the unprefixed name.
	const unprefixedCookie = async (user: TestUser) => {
		const session = framework.createSession();
		await session.connectUser(user);
		return session.cookie.replace('__Host-', '');
	};

	const checkAs = (cookie: string) =>
		app.request('/auth/check', {
			headers: { Cookie: cookie },
		});

	const addressesOf = async (response: Response) =>
		((await response.json()) as AuthCheckResponse).addresses
			.map((a) => a.address)
			.sort();

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

	test('a post without a body or an origin is not refused', async () => {
		const session = framework.createSession();
		await session.connectUser(newUser());

		const response = await session.request(
			'/auth/disconnect',
			{ method: 'POST' },
		);
		expect(response.status).toBe(200);
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

	test('signing in sets a host-prefixed session cookie', async () => {
		const session = framework.createSession();
		const expiry = defaultExpiry();

		const response = await session.post('/auth/connect', {
			signature: await sign(
				newUser(),
				PersonalMessages.connect(expiry),
			),
			expiry,
		});

		const [cookie] = response.headers.getSetCookie();
		expect(cookie).toStartWith('__Host-connected-wallet=');
		expect(cookie).toContain('Path=/');
		expect(cookie).toContain('HttpOnly');
		expect(cookie).toContain('Secure');
		expect(cookie).toContain('SameSite=Lax');
		expect(cookie).not.toContain('Domain');
	});

	test('the prefixed cookie wins over the unprefixed one', async () => {
		const alice = newUser();
		const session = framework.createSession();
		await session.connectUser(alice);

		const response = await checkAs(
			`${await unprefixedCookie(newUser())}; ${session.cookie}`,
		);

		expect(response.status).toBe(200);
		expect(await addressesOf(response)).toEqual([
			alice.address,
		]);
	});

	test('an unprefixed session cookie still authenticates', async () => {
		const user = newUser();

		const response = await checkAs(
			await unprefixedCookie(user),
		);

		expect(response.status).toBe(200);
		expect(await addressesOf(response)).toEqual([
			user.address,
		]);
	});

	test('signing in with an unprefixed cookie starts a new session', async () => {
		const alice = newUser();
		const expiry = defaultExpiry();

		const response = await app.request('/auth/connect', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: await unprefixedCookie(newUser()),
			},
			body: JSON.stringify({
				signature: await sign(
					alice,
					PersonalMessages.connect(expiry),
				),
				expiry,
			}),
		});
		const [cookie] = response.headers.getSetCookie();

		expect(
			await addressesOf(
				await checkAs(cookie.split(';')[0]),
			),
		).toEqual([alice.address]);
	});

	test('disconnecting clears both session cookies', async () => {
		const session = framework.createSession();
		await session.connectUser(newUser());

		const response = await session.request(
			'/auth/disconnect',
			{ method: 'POST' },
		);

		const cookies = response.headers.getSetCookie();
		expect(cookies).toHaveLength(2);
		expect(cookies[0]).toStartWith(
			'__Host-connected-wallet=;',
		);
		expect(cookies[1]).toStartWith('connected-wallet=;');
		for (const cookie of cookies)
			expect(cookie).toContain('Max-Age=0');
	});

	test('a signature that cannot be read gets a 400', async () => {
		const session = framework.createSession();

		expect(
			await errorOf(
				await session.post('/auth/connect', {
					signature: 'QQ==',
					expiry: defaultExpiry(),
				}),
			),
		).toEqual({
			status: 400,
			body: { error: CommonErrors.InvalidSignature },
		});
	});
});
