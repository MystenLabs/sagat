// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */

// Creates the database in `DATABASE_URL` if it does not exist yet, then
// applies all pending migrations. Used by the UI e2e suite before it boots the
// API, and safe to run against an existing database.
// `--fresh` drops it first (local databases only).
import { Pool } from 'pg';

import { runMigrations } from '../src/db/migrate';

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl)
		throw new Error('DATABASE_URL is not set');

	const databaseName = decodeURIComponent(
		new URL(databaseUrl).pathname.slice(1),
	);
	if (!/^[A-Za-z0-9_]+$/.test(databaseName))
		throw new Error(
			`Refusing to create database with unexpected name "${databaseName}"`,
		);

	const fresh = process.argv.includes('--fresh');
	const { protocol, hostname, search } = new URL(
		databaseUrl,
	);
	// Query parameters such as ?host= override the hostname in pg.
	if (
		fresh &&
		(!['postgres:', 'postgresql:'].includes(protocol) ||
			!['localhost', '127.0.0.1', '::1', '[::1]'].includes(
				hostname,
			) ||
			search !== '')
	)
		throw new Error(
			'Refusing --fresh: use a postgres:// or postgresql:// URL with a local hostname and no query parameters',
		);

	// Connect to the server's default database to create the target one.
	const adminUrl = new URL(databaseUrl);
	adminUrl.pathname = '/postgres';
	const admin = new Pool({
		connectionString: adminUrl.href,
	});
	try {
		if (fresh) {
			await admin.query(
				`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
			);
			console.log(`Dropped database ${databaseName}`);
		}
		const { rowCount } = await admin.query(
			'SELECT 1 FROM pg_database WHERE datname = $1',
			[databaseName],
		);
		if (!rowCount) {
			await admin.query(
				`CREATE DATABASE "${databaseName}"`,
			);
			console.log(`Created database ${databaseName}`);
		}
	} finally {
		await admin.end();
	}

	await runMigrations({ database: databaseUrl });
	console.log(`Database ${databaseName} is migrated`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
