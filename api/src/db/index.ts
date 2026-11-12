// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import {
	dbConnectionPoolSize,
	dbQueryErrors,
} from '../metrics';
import { databaseUrl } from './database-url';
import {
	SchemaAccountAliases,
	SchemaAccountAliasState,
	SchemaAccountEvents,
	SchemaAccountKeys,
	SchemaAccountProposers,
	SchemaAccounts,
	SchemaAccountSignerSets,
	SchemaAddresses,
	SchemaProposals,
	SchemaProposalSignatures,
	SchemaSignerSetMembers,
	SchemaSignerSets,
} from './schema';

const IDLE_IN_TRANSACTION_TIMEOUT_MS = 30_000;

// Create a connection pool with configuration
const pool = new Pool({
	connectionString: databaseUrl(),
	max: 20,
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 2000,
	idle_in_transaction_session_timeout:
		IDLE_IN_TRANSACTION_TIMEOUT_MS,
});

// Without this, a connection lost mid-request crashes the process.
pool.on('connect', (client) => {
	client.on('error', (err) => {
		// eslint-disable-next-line no-console
		console.error('Database connection lost', err);
	});
});

// Update pool metrics
const updatePoolMetrics = () => {
	dbConnectionPoolSize.set(
		{ state: 'total' },
		pool.totalCount,
	);
	dbConnectionPoolSize.set(
		{ state: 'idle' },
		pool.idleCount,
	);
	dbConnectionPoolSize.set(
		{ state: 'waiting' },
		pool.waitingCount,
	);
};

// Update metrics every 10 seconds
setInterval(updatePoolMetrics, 10000);

// Initial metrics update
updatePoolMetrics();

// Handle pool errors
pool.on('error', (err) => {
	// eslint-disable-next-line no-console
	console.error('Unexpected error on idle client', err);
	dbQueryErrors.inc({
		operation: 'pool',
		table: 'unknown',
	});
	process.exit(-1);
});

// Create drizzle instance with the pool and schema
export const db = drizzle(pool, {
	schema: {
		SchemaAddresses,
		SchemaAccounts,
		SchemaSignerSets,
		SchemaSignerSetMembers,
		SchemaProposals,
		SchemaAccountProposers,
		SchemaProposalSignatures,
		SchemaAccountAliases,
		SchemaAccountAliasState,
		SchemaAccountSignerSets,
		SchemaAccountKeys,
		SchemaAccountEvents,
	},
});
