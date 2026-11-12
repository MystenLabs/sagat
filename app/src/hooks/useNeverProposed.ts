// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	PROPOSALS_PAGE_SIZE,
	usePaginatedProposals,
} from './usePaginatedProposals';

/**
 * Whether the account never had a proposal, for an empty list that wants to
 * say so. Shares the All tab's cached query; asks only while `enabled`.
 */
export function useNeverProposed({
	multisigAddress,
	network,
	enabled,
}: {
	multisigAddress: string;
	network: string;
	enabled: boolean;
}) {
	const query = usePaginatedProposals({
		multisigAddress,
		network,
		perPage: PROPOSALS_PAGE_SIZE,
		enabled,
	});
	return {
		isPending: enabled && query.isPending,
		neverProposed:
			enabled && query.data?.pages[0]?.data.length === 0,
	};
}
