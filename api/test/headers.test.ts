// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from 'bun:test';

import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

test('a cross-origin response carries the CORS and policy headers', async () => {
	const app = await createTestApp();
	const origin = 'http://localhost:5173';

	const response = await app.request('/health', {
		headers: { Origin: origin },
	});

	expect(response.status).toBe(200);
	expect(
		Object.fromEntries(
			[
				'access-control-allow-origin',
				'access-control-allow-credentials',
				'content-security-policy',
				'strict-transport-security',
				'x-content-type-options',
				'x-frame-options',
				'referrer-policy',
			].map((name) => [name, response.headers.get(name)]),
		),
	).toEqual({
		'access-control-allow-origin': origin,
		'access-control-allow-credentials': 'true',
		'content-security-policy':
			"default-src 'none'; frame-ancestors 'none'",
		'strict-transport-security': 'max-age=31536000',
		'x-content-type-options': 'nosniff',
		'x-frame-options': 'DENY',
		'referrer-policy': 'no-referrer',
	});
});
