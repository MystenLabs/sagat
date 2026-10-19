// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Loads the key labels of accounts, batched like the signer set loader.
 * Labels belong to an account and a public key, not to a signer set member.
 */

import DataLoader from 'dataloader';
import { and, inArray, isNotNull } from 'drizzle-orm';

import { db } from '../db';
import { SchemaAccountKeys } from '../db/schema';
import { type KeyLabels } from '../legacy/serializers';
import {
	BATCH_SIZE,
	SCHEDULER_INTERVAL,
} from './signer-set.loader';

async function batchLoadAccountKeyLabels(
	accountAddresses: readonly string[],
) {
	const rows = await db
		.select({
			accountAddress: SchemaAccountKeys.accountAddress,
			publicKey: SchemaAccountKeys.publicKey,
			label: SchemaAccountKeys.label,
		})
		.from(SchemaAccountKeys)
		.where(
			and(
				inArray(SchemaAccountKeys.accountAddress, [
					...new Set(accountAddresses),
				]),
				isNotNull(SchemaAccountKeys.label),
			),
		);

	const byAccount = new Map<string, Map<string, string>>();
	for (const row of rows) {
		if (row.label === null) continue;
		let labels = byAccount.get(row.accountAddress);
		if (!labels) {
			labels = new Map();
			byAccount.set(row.accountAddress, labels);
		}
		labels.set(row.publicKey, row.label);
	}

	return accountAddresses.map(
		(accountAddress): KeyLabels =>
			byAccount.get(accountAddress) ?? new Map(),
	);
}

export const AccountKeyLabelsDataLoader = new DataLoader(
	batchLoadAccountKeyLabels,
	{
		batch: true,
		maxBatchSize: BATCH_SIZE,
		cache: false,
		batchScheduleFn: (callback) =>
			setTimeout(callback, SCHEDULER_INTERVAL),
	},
);
