import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import {
	SchemaAddresses,
	SchemaMultisigMembers,
	SchemaMultisigProposers,
	SchemaMultisigs,
	SchemaProposals,
	SchemaProposalSignatures,
} from './schema';

// Create a connection pool with configuration
const pool = new Pool({
	connectionString:
		process.env.DATABASE_URL ||
		'postgresql://localhost:5432/multisig_db',
	max: 20,
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 2000,
});

// Handle pool errors
pool.on('error', (err) => {
	console.error('Unexpected error on idle client', err);
	process.exit(-1);
});

// Create drizzle instance with the pool and schema
export const db = drizzle(pool, {
	schema: {
		SchemaAddresses,
		SchemaMultisigs,
		SchemaMultisigMembers,
		SchemaProposals,
		SchemaMultisigProposers,
		SchemaProposalSignatures,
	},
});
