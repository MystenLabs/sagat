// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterAll, beforeAll, mock } from 'bun:test';

import app from '../../src/index.js';
import { isNetworkRunning } from './sui-network';
import {
	clearTestData,
	setupTestDatabase,
	teardownTestDatabase,
	type TestDatabase,
} from './test-db';

let testDb: TestDatabase | undefined;

export const setupSharedTestEnvironment = () => {
	beforeAll(async () => {
		if (!(await isNetworkRunning()))
			throw new Error(
				'Local Sui network not running. Start it with: sui start --force-regenesis --with-faucet',
			);

		testDb = await setupTestDatabase();
		const { db } = testDb;
		mock.module('../../src/db', () => ({ db }));
	});

	afterAll(async () => {
		if (testDb) await teardownTestDatabase(testDb);
	});
};

// The app, with an empty database.
export const createTestApp = async () => {
	if (!testDb)
		throw new Error(
			'Call setupSharedTestEnvironment() first.',
		);
	await clearTestData(testDb.db);
	return app;
};
