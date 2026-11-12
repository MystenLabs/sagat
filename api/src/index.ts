// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';

import { LIMITS } from './constants/limits';
import {
	CORS_ALLOWED_ORIGINS,
	SUI_RPC_URL,
	SUPPORTED_NETWORKS,
} from './db/env';
import { runMigrations } from './db/migrate';
import { appErrorHandler } from './errors';
import { register } from './metrics';
import { metricsMiddleware } from './middleware/metrics';
import addressesRouter from './routes/addresses';
import authRouter from './routes/auth';
import multisigRouter from './routes/multisig';
import proposalsRouter from './routes/proposals';
import { optionalEnv } from './utils/env';

// Bun serves the default export only once this module has finished
// evaluating, so no request reaches a database that is behind. Set
// MIGRATE_ON_START=false when migrations run as a separate step.
if (optionalEnv('MIGRATE_ON_START') !== 'false') {
	try {
		await runMigrations();
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error('Migrations failed, not starting', error);
		process.exit(1);
	}
}

const app = new Hono();

// Apply metrics middleware to all routes
app.use('*', metricsMiddleware);
app.use(
	'*',
	secureHeaders({
		contentSecurityPolicy: {
			defaultSrc: ["'none'"],
			frameAncestors: ["'none'"],
		},
		strictTransportSecurity: 'max-age=31536000',
		xFrameOptions: 'DENY',
	}),
);

// eslint-disable-next-line no-console
console.log(
	`Using RPC URLs: ${SUPPORTED_NETWORKS.map((n) => SUI_RPC_URL[n]).join(', ')}`,
);

// Allow localhost for development, and the origins from environment.
const isAllowedOrigin = (origin: string) =>
	origin.startsWith('http://localhost:') ||
	CORS_ALLOWED_ORIGINS.includes(origin);

app.use(
	'*',
	cors({
		origin: (origin) =>
			isAllowedOrigin(origin)
				? origin
				: CORS_ALLOWED_ORIGINS[0],
		allowMethods: [
			'GET',
			'POST',
			'PUT',
			'DELETE',
			'OPTIONS',
		],
		allowHeaders: ['Content-Type', 'Authorization'],
		maxAge: 600,
		credentials: true,
	}),
);
// Form-like posts from a browser must come from an allowed origin. Requests
// with neither Origin nor Sec-Fetch-Site aren't from a page and skip the check.
const checkOrigin = csrf({ origin: isAllowedOrigin });
app.use('*', (c, next) =>
	c.req.header('origin') || c.req.header('sec-fetch-site')
		? checkOrigin(c, next)
		: next(),
);
app.use(
	'*',
	bodyLimit({ maxSize: LIMITS.maxRequestBodyBytes }),
);

// Health check endpoint
app.get('/health', (c) => {
	return c.json({
		status: 'healthy',
		timestamp: new Date().toISOString(),
		networks: SUPPORTED_NETWORKS,
		version: '1.0.0',
	});
});

// Root endpoint
app.get('/', (c) => {
	return c.text(
		`Sagat API is up and running on networks: ${SUPPORTED_NETWORKS.join(', ')}`,
	);
});

// Metrics endpoint (no CORS, for Grafana Alloy scraping within cluster)
app.get('/metrics', async (c) => {
	const metrics = await register.metrics();
	return c.text(metrics, 200, {
		'Content-Type': register.contentType,
	});
});

app.route('/auth', authRouter);
app.route('/addresses', addressesRouter);
app.route('/multisig', multisigRouter);
app.route('/proposals', proposalsRouter);

// Map known errors
app.onError(appErrorHandler);

export default app;
