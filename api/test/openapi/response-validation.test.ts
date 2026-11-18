// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { createRoute } from '@hono/zod-openapi';
import { expect, spyOn, test } from 'bun:test';
import { z } from 'zod';

import { appErrorHandler } from '../../src/errors';
import {
	createV1App,
	defineRoute,
} from '../../src/v1/openapi';

const app = createV1App();
app.onError(appErrorHandler);

defineRoute(
	app,
	createRoute({
		method: 'get',
		path: '/thing',
		responses: {
			200: {
				description: 'A thing.',
				content: {
					'application/json': {
						schema: z.object({ count: z.number() }),
					},
				},
			},
		},
	}),
	// A handler that drifted from its schema.
	async () =>
		({
			count: 'secret-value',
		}) as unknown as { count: number },
);

test('a response that does not match its schema is a generic 500', async () => {
	const log = spyOn(console, 'error').mockImplementation(
		() => {},
	);

	const response = await app.request('/v1/thing');

	expect(response.status).toBe(500);
	const body = await response.text();
	expect(JSON.parse(body)).toEqual({
		error: 'Internal Server Error',
	});
	expect(body).not.toContain('secret-value');
	expect(log).toHaveBeenCalledTimes(1);
	expect(String(log.mock.calls[0][0])).toContain(
		'Response schema mismatch on GET /v1/thing',
	);
	expect(JSON.stringify(log.mock.calls[0])).not.toContain(
		'secret-value',
	);
	log.mockRestore();
});
