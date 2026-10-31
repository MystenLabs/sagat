// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { isValidTransactionDigest } from '@mysten/sui/utils';
import DataLoader from 'dataloader';
import { inArray } from 'drizzle-orm';

import { db } from '../db';
import {
	SchemaProposals,
	SchemaProposalSignatures,
	type ProposalWithSignatures,
} from '../db/schema';

const Settings = {
	BATCH_SIZE: 100,
	SCHEDULER_INTERVAL: 100,
};

// Data loader to query multiple proposals at the same time.
async function batchLoadProposalsByDigest(
	digests: readonly string[],
) {
	// Invalid digests are left out of the query and resolve to null: one that
	// Postgres rejects (e.g. a NUL byte) would fail every key in the batch.
	const uniqueDigests = [...new Set(digests)].filter(
		isValidTransactionDigest,
	);

	const proposals = await db.query.SchemaProposals.findMany(
		{
			where: inArray(SchemaProposals.digest, uniqueDigests),
		},
	);

	const signatures =
		await db.query.SchemaProposalSignatures.findMany({
			where: inArray(
				SchemaProposalSignatures.proposalId,
				proposals.map((p) => p.id),
			),
		});

	const resolved: (ProposalWithSignatures | null)[] = [];

	for (const digest of digests) {
		const proposal = proposals.find(
			(p) => p.digest === digest,
		);
		const signaturesForProposal = signatures.filter(
			(s) => s.proposalId === proposal?.id,
		);
		if (!proposal) {
			resolved.push(null);
			continue;
		}
		resolved.push({
			...proposal,
			signatures: signaturesForProposal.map((s) => ({
				publicKey: s.publicKey,
				proposalId: s.proposalId,
				signature: s.signature,
			})),
		});
	}

	return resolved;
}

export const ProposalByDigestLoader = new DataLoader(
	batchLoadProposalsByDigest,
	{
		batch: true,
		maxBatchSize: Settings.BATCH_SIZE,
		cache: false,
		batchScheduleFn: (callback) =>
			setTimeout(callback, Settings.SCHEDULER_INTERVAL),
	},
);
