// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type AppProposal } from '../src/lib/proposal-integrity';

/** A pending `/v1` proposal as the app holds it, with no signatures or signer sets; `fields` replace its own. */
export function v1Proposal(
	fields: Partial<AppProposal> = {},
): AppProposal {
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
		notActingSets: [],
		signerChange: null,
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
