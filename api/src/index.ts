// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Hono } from 'hono';
import { cors } from 'hono/cors';

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
import { createV1App } from './v1/app';

// Bun serves the default export only once this module has finished
// evaluating, so no request reaches a database that is behind. Set
// MIGRATE_ON_START=false when migrations run as a separate step.
if (process.env.MIGRATE_ON_START !== 'false') {
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

// eslint-disable-next-line no-console
console.log(
	`Using RPC URLs: ${SUPPORTED_NETWORKS.map((n) => SUI_RPC_URL[n]).join(', ')}`,
);

app.use(
	'*',
	cors({
		origin: (origin) => {
			// Allow localhost for development
			if (origin.startsWith('http://localhost:'))
				return origin;
			// Check against allowed origins from environment
			return CORS_ALLOWED_ORIGINS.includes(origin)
				? origin
				: CORS_ALLOWED_ORIGINS[0];
		},
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

// The `/v1` API, with its spec and docs page. See `v1/app.ts`.
app.route('/', createV1App());

// Map known errors
app.onError(appErrorHandler);

export default app;
