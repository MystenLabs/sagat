// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Proposal } from '@mysten/sagat/v1';

/** A pending `/v1` proposal with no signatures or signer sets; `fields` replace its own. */
export function v1Proposal(
	fields: Partial<Proposal> = {},
): Proposal {
	return {
		digest: 'digest',
		accountAddress: '0x1',
		accountName: null,
		network: 'localnet',
		kind: 'transaction',
		status: 'PENDING',
		ready: false,
		transactionBytes: '',
		proposerAddress: '0x1',
		description: null,
		createdAt: '2026-11-23T10:00:00.000Z',
		signatures: [],
		signerSets: [],
		events: {
			created: null,
			proposer: null,
			cancelled: null,
		},
		executedVia: null,
		signerSetsStale: false,
		...fields,
	};
}
