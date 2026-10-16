// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Migration safety checks. They need Postgres only (no localnet) and run in
 * CI's `migration-test` job through `bun test:migrations`.
 *
 * 1. Upgrade path, one test per entry in `cases.ts`: migrate a scratch
 *    database to the baseline, seed it with plain SQL in the old schema,
 *    apply the target migration with drizzle's migrator, and check that the
 *    data survived plus the migration-specific assertions.
 * 2. Empty path: every migration on an empty database, and the result
 *    matches the latest drizzle snapshot.
 * 3. Startup: `runMigrations`, which the API calls when it starts, brings an
 *    empty database to the latest migration, does nothing the second time,
 *    serialises concurrent callers on its advisory lock, and refuses a
 *    database that has tables but no migration journal.
 */
import { describe, expect, test } from 'bun:test';

import {
	defaultMigrationsFolder,
	MISSING_JOURNAL_MESSAGE,
	runMigrations,
} from '../../src/db/migrate';
import { migrationCases } from './cases';
import {
	appliedMigrationCount,
	journalEntry,
	latestMigrationIndex,
	liveStructure,
	MIGRATIONS_FOLDER,
	publicTables,
	readSnapshot,
	snapshotStructure,
	withScratchDb,
} from './helpers';

describe('migration upgrade path', () => {
	for (const c of migrationCases) {
		test(c.name, async () => {
			// Fail early with a clear message if a case names a missing migration.
			journalEntry(c.baseline);
			journalEntry(c.target);

			await withScratchDb(`up${c.target}`, async (db) => {
				await db.migrateTo(c.baseline);
				expect(await appliedMigrationCount(db)).toBe(
					c.baseline + 1,
				);

				await db.pool.query(c.seed);
				const before = await Promise.all(
					c.preserved.map((p) => db.rows(p.before)),
				);
				for (const [i, rows] of before.entries())
					expect(
						rows.length,
						`seed has no rows for ${c.preserved[i].label}`,
					).toBeGreaterThan(0);

				await db.migrateTo(c.target);
				expect(await appliedMigrationCount(db)).toBe(
					c.target + 1,
				);

				for (const [i, p] of c.preserved.entries())
					expect(await db.rows(p.after), p.label).toEqual(
						before[i],
					);

				await c.verify(db);
			});
		});
	}
});

describe('migration empty path', () => {
	test('every migration applies to an empty database and matches the latest snapshot', async () => {
		const latest = latestMigrationIndex();
		const snapshot = readSnapshot(latest);

		await withScratchDb('empty', async (db) => {
			await db.migrateTo(latest);
			expect(await appliedMigrationCount(db)).toBe(
				latest + 1,
			);

			expect(await publicTables(db)).toEqual(
				Object.values(snapshot.tables)
					.map((t) => t.name)
					.sort(),
			);
			for (const table of await publicTables(db))
				expect(
					Number(
						await db.value(
							`SELECT count(*) FROM "${table}"`,
						),
					),
					table,
				).toBe(0);

			expect(await liveStructure(db)).toEqual(
				snapshotStructure(snapshot),
			);
		});
	});
});

describe('startup migrations', () => {
	const quiet = { log: () => {} };

	test('the default migrations folder is the real one', () => {
		expect(defaultMigrationsFolder()).toBe(
			MIGRATIONS_FOLDER,
		);
	});

	test('runMigrations brings an empty database to the latest migration, then does nothing', async () => {
		const latest = latestMigrationIndex();
		await withScratchDb('startup', async (db) => {
			expect(
				await runMigrations({
					database: db.pool,
					...quiet,
				}),
			).toBe(latest + 1);
			expect(await appliedMigrationCount(db)).toBe(
				latest + 1,
			);

			expect(
				await runMigrations({
					database: db.pool,
					...quiet,
				}),
			).toBe(0);
			expect(await appliedMigrationCount(db)).toBe(
				latest + 1,
			);
		});
	});

	test('concurrent runMigrations calls apply the migrations once', async () => {
		const latest = latestMigrationIndex();
		await withScratchDb('startuplock', async (db) => {
			// Separate pools, like two replicas starting together.
			const applied = await Promise.all([
				runMigrations({ database: db.url, ...quiet }),
				runMigrations({ database: db.url, ...quiet }),
			]);
			expect(applied.sort()).toEqual([0, latest + 1]);
			expect(await appliedMigrationCount(db)).toBe(
				latest + 1,
			);
			expect(await liveStructure(db)).toEqual(
				snapshotStructure(readSnapshot(latest)),
			);
		});
	});

	test('runMigrations refuses a database with tables but no migration journal', async () => {
		await withScratchDb('nojournal', async (db) => {
			await db.pool.query(
				'CREATE TABLE "multisigs" (address text)',
			);
			await expect(
				runMigrations({ database: db.pool, ...quiet }),
			).rejects.toThrow(MISSING_JOURNAL_MESSAGE);
			expect(await publicTables(db)).toEqual(['multisigs']);
			// Refused before drizzle creates its journal table.
			expect(
				await db.value(
					`SELECT to_regclass('drizzle.__drizzle_migrations') IS NULL`,
				),
			).toBe(true);
		});
	});
});
