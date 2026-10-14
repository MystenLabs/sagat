// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Data loader should be used whenever we query for signer set data.
 * It returns a `SignerSetWithMembers` for each result requested.
 *
 * It is batching requests 100 at a time, or 5ms (whichever is faster!).
 */

import DataLoader from 'dataloader';
import { asc, inArray } from 'drizzle-orm';

import { db } from '../db';
import {
	SchemaSignerSetMembers,
	SchemaSignerSets,
	type SignerSetWithMembers,
} from '../db/schema';

export const SCHEDULER_INTERVAL = 5; // ms. Requests are grouped by either 5ms or 100 keys.
export const BATCH_SIZE = 100;

// Data loader to query multiple signer sets at the same time.
async function batchLoadSignerSets(
	addresses: readonly string[],
) {
	const uniqueAddresses = [...new Set(addresses)];
	// Query all the signer sets, with their members.
	// We split the query in 2 calls, but we know that we only do it once per batch.
	const [signerSets, members] = await Promise.all([
		db
			.select()
			.from(SchemaSignerSets)
			.where(
				inArray(SchemaSignerSets.address, uniqueAddresses),
			),
		db
			.select()
			.from(SchemaSignerSetMembers)
			.where(
				inArray(
					SchemaSignerSetMembers.signerSetAddress,
					uniqueAddresses,
				),
			)
			.orderBy(asc(SchemaSignerSetMembers.order)),
	]);

	return addresses.map(
		(address): SignerSetWithMembers | null => {
			const signerSet = signerSets.find(
				(result) => result.address === address,
			);
			if (!signerSet) return null;

			const memberList = members
				.filter(
					(result) => result.signerSetAddress === address,
				)
				.sort((a, b) => a.order - b.order);

			return {
				...signerSet,
				members: memberList,
				totalMembers: memberList.length,
				totalWeight: memberList.reduce(
					(acc, member) => acc + member.weight,
					0,
				),
			};
		},
	);
}

export const SignerSetDataLoader = new DataLoader(
	batchLoadSignerSets,
	{
		batch: true,
		maxBatchSize: BATCH_SIZE,
		cache: false,
		batchScheduleFn: (callback) =>
			setTimeout(callback, SCHEDULER_INTERVAL),
	},
);
