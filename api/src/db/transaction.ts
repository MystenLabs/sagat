// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { eq, sql } from 'drizzle-orm';

import { type db } from './index';
import { SchemaAccounts } from './schema';

export type DatabaseTransaction = Parameters<
	Parameters<(typeof db)['transaction']>[0]
>[0];

const withLockTimeout = new WeakSet<DatabaseTransaction>();

// Locks the account until `tx` ends, so writers for it run one at a time.
// Relies on READ COMMITTED: reads after the lock see the other's writes.
export const lockAccount = async (
	tx: DatabaseTransaction,
	address: string,
) => {
	// Waiters give up instead of holding a pooled connection.
	if (!withLockTimeout.has(tx)) {
		await tx.execute(sql`SET LOCAL lock_timeout = '1s'`);
		withLockTimeout.add(tx);
	}
	await tx
		.select({ address: SchemaAccounts.address })
		.from(SchemaAccounts)
		.where(eq(SchemaAccounts.address, address))
		.for('no key update');
};
