// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */

// Creates the database in `DATABASE_URL` if it does not exist yet, then
// applies all pending migrations. Used by the UI e2e suite before it boots the
// API, and safe to run against an existing database.
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

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

	// Connect to the server's default database to create the target one.
	const adminUrl = new URL(databaseUrl);
	adminUrl.pathname = '/postgres';
	const admin = new Pool({
		connectionString: adminUrl.href,
	});
	try {
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

	const pool = new Pool({ connectionString: databaseUrl });
	try {
		await migrate(drizzle(pool), {
			migrationsFolder: path.join(
				__dirname,
				'..',
				'drizzle',
			),
		});
		console.log(`Database ${databaseName} is migrated`);
	} finally {
		await pool.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
