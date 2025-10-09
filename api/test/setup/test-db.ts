import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import * as schema from '../../src/db/schema';

const CONNECTION_STRING =
	process.env.TEST_DATABASE_URL ||
	'postgresql://localhost:5432/postgres';

export async function setupTestDatabase() {
	const dbName = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;

	// Create test database
	const adminPool = new Pool({
		connectionString: CONNECTION_STRING,
	});
	await adminPool.query(`CREATE DATABASE ${dbName}`);
	await adminPool.end();

	// Connect and migrate
	const pool = new Pool({
		connectionString: `${CONNECTION_STRING}/${dbName}`,
	});
	const db = drizzle(pool, { schema });
	await migrate(db, { migrationsFolder: './drizzle' });

	return { db, dbName, pool };
}

export async function teardownTestDatabase(
	dbName: string,
	pool: Pool,
) {
	await pool.end();

	const adminPool = new Pool({
		connectionString: CONNECTION_STRING,
	});
	await adminPool.query(
		`DROP DATABASE IF EXISTS ${dbName}`,
	);
	await adminPool.end();
}

export async function clearTestData(db: any) {
	await db.delete(schema.SchemaMultisigProposers);
	await db.delete(schema.SchemaProposalSignatures);
	await db.delete(schema.SchemaProposals);
	await db.delete(schema.SchemaMultisigMembers);
	await db.delete(schema.SchemaMultisigs);
	await db.delete(schema.SchemaAddresses);
}
