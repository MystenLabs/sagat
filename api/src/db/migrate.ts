// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';

import { databaseUrl } from './database-url';

/**
 * Key of the session-level advisory lock held while migrating: the ASCII
 * bytes of "sagatmig" read as a bigint, kept as a string because it does not
 * fit in a JS number. Any key works as long as nothing else in the database
 * uses it. Replicas that start together queue on it, so one applies the
 * migrations and the others then find nothing pending.
 */
export const MIGRATION_LOCK_KEY = '8314040055365462375';

/**
 * How long a migration statement waits for a table lock before Postgres
 * cancels it. A rename blocked by an open transaction then fails with
 * "canceling statement due to lock timeout" instead of stalling every
 * replica behind it. There is deliberately no `statement_timeout`: a long
 * migration must be allowed to finish.
 */
export const MIGRATION_LOCK_TIMEOUT = '10s';

/** Thrown when the database has tables but no migration journal. */
export const MISSING_JOURNAL_MESSAGE =
	'The database has tables but no migration journal. It was not set up with drizzle migrations. Seed drizzle.__drizzle_migrations or run migrations manually, then start again.';

export interface RunMigrationsOptions {
	/**
	 * A pool or connection string. Defaults to `DATABASE_URL`. A pool is used
	 * as it is; for a connection string the function creates its own pool
	 * with `connectionTimeoutMillis: 5000`, so an unreachable database fails
	 * startup after 5 s instead of hanging.
	 */
	database?: Pool | string;
	/** Defaults to `MIGRATIONS_FOLDER`, else the api package's `drizzle/`. */
	migrationsFolder?: string;
	/** Defaults to `console.log`. */
	log?: (message: string) => void;
}

/**
 * The api package's `drizzle/` folder. `import.meta.dir` is `src/db` from
 * source, `dist` in the server bundle and `dist/db` in the migration CLI
 * bundle, so walk up to the first directory that has
 * `drizzle/meta/_journal.json` instead of using a fixed depth.
 * `MIGRATIONS_FOLDER` overrides it.
 */
export function defaultMigrationsFolder(): string {
	if (process.env.MIGRATIONS_FOLDER)
		return resolve(process.env.MIGRATIONS_FOLDER);
	for (
		let dir = import.meta.dir;
		dir !== dirname(dir);
		dir = dirname(dir)
	) {
		const folder = join(dir, 'drizzle');
		if (existsSync(join(folder, 'meta', '_journal.json')))
			return folder;
	}
	throw new Error(
		`No drizzle migrations folder above ${import.meta.dir}. Set MIGRATIONS_FOLDER.`,
	);
}

/**
 * Applies every pending migration, and returns how many it applied.
 *
 * Drizzle's node-postgres migrator applies all pending migrations and their
 * journal rows in one transaction, so a failure leaves the database exactly
 * as it was (apart from the empty `drizzle.__drizzle_migrations` table it
 * creates beforehand). Errors propagate.
 *
 * Before migrating it refuses a database that has tables in `public` but an
 * empty or missing journal, which drizzle would otherwise try to build from
 * migration 0000. While migrating, statements wait at most
 * `MIGRATION_LOCK_TIMEOUT` for a lock.
 */
export async function runMigrations(
	options: RunMigrationsOptions = {},
): Promise<number> {
	const log = options.log ?? console.log;
	const migrationsFolder =
		options.migrationsFolder ?? defaultMigrationsFolder();
	const ownPool = !(options.database instanceof Pool);
	const pool =
		options.database instanceof Pool
			? options.database
			: new Pool({
					connectionString:
						options.database ?? databaseUrl(),
					connectionTimeoutMillis: 5000,
				});

	try {
		log('Applying pending migrations');
		const client = await pool.connect();
		// A failed unlock destroys the connection, which also drops the lock.
		let releaseError: Error | undefined;
		try {
			// Waiting for the advisory lock is not bounded: a replica queues for
			// as long as another one migrates. lock_timeout would cancel that
			// wait too, so it is set only once the lock is held.
			await client.query('SELECT pg_advisory_lock($1)', [
				MIGRATION_LOCK_KEY,
			]);
			try {
				await client.query(
					`SET lock_timeout = '${MIGRATION_LOCK_TIMEOUT}'`,
				);
				const before = await appliedCount(client);
				if (before === 0 && (await hasPublicTables(client)))
					throw new Error(MISSING_JOURNAL_MESSAGE);
				await migrate(drizzle(client), {
					migrationsFolder,
				});
				const applied =
					(await appliedCount(client)) - before;
				log(
					applied
						? `Applied ${applied} migration${applied === 1 ? '' : 's'}`
						: 'Database is up to date',
				);
				return applied;
			} finally {
				// RESET first: a caller's pool gets the connection back as it was.
				await client
					.query('RESET lock_timeout')
					.then(() =>
						client.query('SELECT pg_advisory_unlock($1)', [
							MIGRATION_LOCK_KEY,
						]),
					)
					.catch((error: Error) => {
						releaseError = error;
					});
			}
		} finally {
			client.release(releaseError);
		}
	} finally {
		if (ownPool) await pool.end();
	}
}

async function appliedCount(
	client: PoolClient,
): Promise<number> {
	const { rows: exists } = await client.query(
		`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists`,
	);
	if (!exists[0].exists) return 0;
	const { rows } = await client.query<{ count: string }>(
		'SELECT count(*) FROM drizzle.__drizzle_migrations',
	);
	return Number(rows[0].count);
}

async function hasPublicTables(
	client: PoolClient,
): Promise<boolean> {
	const { rows } = await client.query(
		`SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public') AS exists`,
	);
	return rows[0].exists;
}
