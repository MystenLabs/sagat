// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Data loader should be used whenever we query for a multisig data.
 * It returns a `MultisigWithMember` for each result requested.
 *
 * It is batching requests 100 at a time, or 100ms (whichever is faster!).
 */

import DataLoader from 'dataloader';
import { asc, inArray } from 'drizzle-orm';

import { db } from '../db';
import {
	SchemaMultisigMembers,
	SchemaMultisigProposers,
	SchemaMultisigs,
	type MultisigWithMembers,
} from '../db/schema';

const SCHEDULER_INTERVAL = 100; // 100ms query intervals. We group groups by either 100ms or 100
const BATCH_SIZE = 100; //

// Data loader to query multiple multisigs at the same time.
async function batchLoadMultisigs(
	addresses: readonly string[],
) {
	const uniqueAddresses = [...new Set(addresses)];
	// Query all the multisigs, with their members.
	// We split the query in 3 calls, but we know that we only do it once per 100 requests batch size (or 100ms)
	const [multisigs, members, proposers] = await Promise.all(
		[
			db
				.select()
				.from(SchemaMultisigs)
				.where(
					inArray(SchemaMultisigs.address, uniqueAddresses),
				),
			db
				.select()
				.from(SchemaMultisigMembers)
				.where(
					inArray(
						SchemaMultisigMembers.multisigAddress,
						uniqueAddresses,
					),
				)
				.orderBy(asc(SchemaMultisigMembers.order)),
			// Query all the proposers for the specified multisigs.
			db.query.SchemaMultisigProposers.findMany({
				where: inArray(
					SchemaMultisigProposers.multisigAddress,
					addresses,
				),
			}),
		],
	);

	const resolved: (MultisigWithMembers | null)[] = [];

	for (const address of addresses) {
		// Find all entries (multisig/members) from the query.
		const multisig = multisigs.filter(
			(result) => result.address === address,
		);

		// If we didn't find a multisig, we can continue..
		if (multisig.length === 0) {
			resolved.push(null);
			continue;
		}

		const setup = multisig[0];

		const memberList = members.filter(
			(result) => result.multisigAddress === address,
		);

		const proposerList = proposers
			.filter(
				(proposer) => proposer.multisigAddress === address,
			)
			.map((proposer) => ({
				address: proposer.address,
				addedBy: proposer.addedBy,
				addedAt: proposer.addedAt,
			}));

		resolved.push({
			...setup,
			members: memberList.sort((a, b) => a.order - b.order),
			proposers: proposerList,
			totalMembers: memberList.length,
			totalWeight: memberList.reduce(
				(acc, member) => acc + member.weight,
				0,
			),
		});
	}

	return resolved;
}

export const MultisigDataLoader = new DataLoader(
	batchLoadMultisigs,
	{
		batch: true,
		maxBatchSize: BATCH_SIZE,
		cache: false,
		batchScheduleFn: (callback) =>
			setTimeout(callback, SCHEDULER_INTERVAL),
	},
);
