// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// No imports and no side effects: `db/migrate.ts` and the drizzle-kit config
// load this without opening a pool.

export const DEFAULT_DATABASE_URL =
	'postgresql://localhost:5432/multisig_db';

/** `DATABASE_URL`, else `DEFAULT_DATABASE_URL`. */
export const databaseUrl = () =>
	process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
