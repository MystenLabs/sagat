// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The `/v1` API: an OpenAPIHono sub-app whose routes are declared with
 * `createRoute`, so one definition validates the request, types the handler
 * and lands in the spec. The legacy routers stay plain Hono and out of the
 * spec. Errors thrown by the services are mapped by the root app's
 * `appErrorHandler`, which the sub-app inherits when it is mounted.
 *
 * Served alongside the routes:
 *   GET /v1/openapi.json  the spec, also committed as `api/openapi/v1.json`
 *   GET /v1/docs          the reference page (Scalar)
 */

import {
	OpenAPIHono,
	type OpenAPIObjectConfigure,
} from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { type Env } from 'hono';

import { mountAddresses } from './routes/addresses';

export const OPENAPI_PATH = '/v1/openapi.json';

// Security schemes shared with the legacy routes, see `auth.service.ts`.
export const SecuritySchemes = {
	cookieAuth: {
		type: 'apiKey',
		in: 'cookie',
		name: 'connected-wallet',
		description:
			'Session cookie set by `POST /auth/connect`. Holds every key connected in the session.',
	},
	bearerAuth: {
		type: 'http',
		scheme: 'bearer',
		bearerFormat: 'JWT',
		description:
			'Script token from `POST /auth/script-connect`: a single key, valid for one hour. Takes precedence over the cookie.',
	},
} as const;

const openApiConfig: OpenAPIObjectConfigure<
	Env,
	'/openapi.json'
> = {
	openapi: '3.1.0',
	info: {
		title: 'Sagat API',
		version: '1.0.0',
		description:
			'Multisig accounts, signer sets and proposals on Sui. Authenticate with the session cookie or a script token; both are issued by the `/auth` routes, which are shared with the legacy API.',
	},
	tags: [
		{
			name: 'Addresses',
			description:
				'Public keys registered with the service and the addresses they derive.',
		},
	],
};

/** Builds the `/v1` sub-app. Mount it at `/` on the root app. */
export const createV1App = () => {
	const v1 = new OpenAPIHono({
		// Request validation failures use the same body as every other error.
		defaultHook: (result, c) => {
			if (result.success) return;
			const message = result.error.issues
				.map((issue) =>
					issue.path.length > 0
						? `${issue.path.join('.')}: ${issue.message}`
						: issue.message,
				)
				.join(' ');
			return c.json({ error: message }, 400);
		},
	}).basePath('/v1');

	for (const [name, scheme] of Object.entries(
		SecuritySchemes,
	))
		v1.openAPIRegistry.registerComponent(
			'securitySchemes',
			name,
			scheme,
		);

	mountAddresses(v1);

	v1.doc31('/openapi.json', openApiConfig);
	v1.get(
		'/docs',
		Scalar({ url: OPENAPI_PATH, pageTitle: 'Sagat API' }),
	);

	return v1;
};
