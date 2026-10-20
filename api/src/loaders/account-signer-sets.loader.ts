// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Loads who drafted an account's original signer set and when, batched like
 * the signer set loader. A legacy multisig is an account whose original
 * composition has the same address, so the row is `(A, A)` in
 * `account_signer_sets`.
 */

import DataLoader from 'dataloader';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db';
import {
	SchemaAccountSignerSets,
	type AccountSignerSet,
} from '../db/schema';
import {
	BATCH_SIZE,
	SCHEDULER_INTERVAL,
} from './signer-set.loader';

/** Who drafted a signer set for an account, and when. */
export type SignerSetOrigin = Pick<
	AccountSignerSet,
	'draftedBy' | 'createdAt'
>;

async function batchLoadSignerSetOrigins(
	accountAddresses: readonly string[],
) {
	const rows = await db
		.select({
			accountAddress:
				SchemaAccountSignerSets.accountAddress,
			draftedBy: SchemaAccountSignerSets.draftedBy,
			createdAt: SchemaAccountSignerSets.createdAt,
		})
		.from(SchemaAccountSignerSets)
		.where(
			and(
				inArray(SchemaAccountSignerSets.accountAddress, [
					...new Set(accountAddresses),
				]),
				eq(
					SchemaAccountSignerSets.signerSetAddress,
					SchemaAccountSignerSets.accountAddress,
				),
			),
		);

	const byAccount = new Map<string, SignerSetOrigin>(
		rows.map((row) => [
			row.accountAddress,
			{
				draftedBy: row.draftedBy,
				createdAt: row.createdAt,
			},
		]),
	);

	return accountAddresses.map(
		(accountAddress): SignerSetOrigin | null =>
			byAccount.get(accountAddress) ?? null,
	);
}

export const SignerSetOriginDataLoader = new DataLoader(
	batchLoadSignerSetOrigins,
	{
		batch: true,
		maxBatchSize: BATCH_SIZE,
		cache: false,
		batchScheduleFn: (callback) =>
			setTimeout(callback, SCHEDULER_INTERVAL),
	},
);
