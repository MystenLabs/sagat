// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import { afterAll, beforeAll, mock } from 'bun:test';
import { type Hono } from 'hono';
import type { Pool } from 'pg';

import * as env from '../../src/db/env';
import { isNetworkRunning } from './sui-network';
import {
	clearTestData,
	setupTestDatabase,
	teardownTestDatabase,
} from './test-db';

let testDbPool: Pool;
let testDbName: string;
let networkChecked = false;

export const setupSharedTestEnvironment = () => {
	beforeAll(async () => {
		// Check Sui network only once
		if (!networkChecked) {
			const running = await isNetworkRunning();
			if (!running) {
				console.error('❌ Local Sui network not running!');
				console.error(
					'Start with: sui start --force-regenesis --with-faucet',
				);
				process.exit(1);
			}
			networkChecked = true;
		}

		// Setup shared test database pool
		({ dbName: testDbName, pool: testDbPool } =
			await setupTestDatabase());

		console.log('[debug] Test database pool initialized');
		console.log('[debug] Test database name:', testDbName);
	});

	afterAll(async () => {
		await teardownTestDatabase(testDbName, testDbPool);
	});
};

export const createTestApp = async (): Promise<Hono> => {
	// Use shared database pool instead of creating new database
	if (!testDbPool) {
		throw new Error(
			'Test database pool not initialized. Call setupSharedTestEnvironment() first.',
		);
	}

	const { drizzle } = await import(
		'drizzle-orm/node-postgres'
	);
	const schema = await import('../../src/db/schema');

	const db = drizzle(testDbPool, { schema });

	// Fast table cleanup instead of database recreation
	await clearTestData(db);

	// Mock modules with fresh db instance
	mock.module('../../src/db', () => ({ db }));
	mock.module('../../src/db/env', () => env);

	return (await import('../../src/index')).default;
};
