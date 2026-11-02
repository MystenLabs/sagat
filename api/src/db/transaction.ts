// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { eq } from 'drizzle-orm';

import { type db } from './index';
import { SchemaAccounts } from './schema';

export type DatabaseTransaction = Parameters<
	Parameters<(typeof db)['transaction']>[0]
>[0];

// The pool, or a transaction whose lock the read must follow.
export type DatabaseReader = Pick<typeof db, 'query'>;

// Locks the account until `tx` ends, so writers for it run one at a time.
// Relies on READ COMMITTED: reads after the lock see the other's writes.
export const lockAccount = async (
	tx: DatabaseTransaction,
	address: string,
) => {
	await tx
		.select({ address: SchemaAccounts.address })
		.from(SchemaAccounts)
		.where(eq(SchemaAccounts.address, address))
		.for('no key update');
};
