// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	afterAll,
	beforeAll,
	expect,
	test,
} from 'bun:test';
import { sql } from 'drizzle-orm';

import './setup/no-startup-migrations';

import type { db as appDb } from '../src/db';
import { SchemaAccounts } from '../src/db/schema';
import { lockAccount } from '../src/db/transaction';
import {
	setupTestDatabase,
	teardownTestDatabase,
	type TestDatabase,
} from './setup/test-db';

let testDb: TestDatabase;
let db: typeof appDb;
const previousUrl = process.env.DATABASE_URL;

beforeAll(async () => {
	testDb = await setupTestDatabase();
	process.env.DATABASE_URL = testDb.url;
	({ db } = await import('../src/db'));
});

afterAll(async () => {
	await db?.$client.end();
	if (previousUrl === undefined)
		delete process.env.DATABASE_URL;
	else process.env.DATABASE_URL = previousUrl;
	if (testDb) await teardownTestDatabase(testDb);
});

test('a transaction left idle loses the account lock, and the pool keeps serving', async () => {
	const address = `0x${'a'.repeat(64)}`;
	await testDb.db
		.insert(SchemaAccounts)
		.values({ address });

	let locked!: () => void;
	const isLocked = new Promise<void>((resolve) => {
		locked = resolve;
	});
	const holder = db.transaction(async (tx) => {
		await lockAccount(tx, address);
		await tx.execute(
			sql`SET LOCAL idle_in_transaction_session_timeout = '200ms'`,
		);
		locked();
		await Bun.sleep(1000);
		await tx.execute(sql`SELECT 1`);
	});

	await isLocked;
	await expect(
		db.transaction((tx) => lockAccount(tx, address)),
	).resolves.toBeUndefined();
	await expect(holder).rejects.toThrow();

	const { rows } = await db.execute(
		sql`SHOW idle_in_transaction_session_timeout`,
	);
	expect(rows).toEqual([
		{ idle_in_transaction_session_timeout: '30s' },
	]);
});
