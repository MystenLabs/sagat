// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Loads the proposers of accounts, batched like the signer set loader.
 * Proposers belong to an account, not to a signer set.
 */

import DataLoader from 'dataloader';
import { inArray } from 'drizzle-orm';

import { db } from '../db';
import {
	SchemaAccountProposers,
	type AccountProposer,
} from '../db/schema';
import {
	BATCH_SIZE,
	SCHEDULER_INTERVAL,
} from './signer-set.loader';

export type Proposer = Omit<
	AccountProposer,
	'accountAddress'
>;

async function batchLoadAccountProposers(
	accountAddresses: readonly string[],
) {
	const proposers =
		await db.query.SchemaAccountProposers.findMany({
			where: inArray(
				SchemaAccountProposers.accountAddress,
				[...new Set(accountAddresses)],
			),
		});

	return accountAddresses.map(
		(accountAddress): Proposer[] =>
			proposers
				.filter(
					(proposer) =>
						proposer.accountAddress === accountAddress,
				)
				.map((proposer) => ({
					address: proposer.address,
					addedBy: proposer.addedBy,
					addedAt: proposer.addedAt,
				})),
	);
}

export const AccountProposersDataLoader = new DataLoader(
	batchLoadAccountProposers,
	{
		batch: true,
		maxBatchSize: BATCH_SIZE,
		cache: false,
		batchScheduleFn: (callback) =>
			setTimeout(callback, SCHEDULER_INTERVAL),
	},
);
