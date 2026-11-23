// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient } from '@tanstack/react-query';

import { type SuiNetwork } from '@/lib/network';

import {
	PROPOSALS_PAGE_SIZE,
	proposalsQueryKey,
	usePaginatedProposals,
} from './usePaginatedProposals';

/** Whether the account never had a proposal; asks only while `enabled`. */
export function useNeverProposed({
	multisigAddress,
	network,
	enabled,
}: {
	multisigAddress: string;
	network: SuiNetwork;
	enabled: boolean;
}) {
	const params = {
		multisigAddress,
		network,
		perPage: PROPOSALS_PAGE_SIZE,
	};
	const query = usePaginatedProposals({
		...params,
		enabled,
	});
	// After a mutation the cached list is stale until its refetch lands.
	const invalidated = !!useQueryClient().getQueryState(
		proposalsQueryKey(params),
	)?.isInvalidated;
	return {
		isPending:
			enabled &&
			(query.isPending ||
				(invalidated && query.isFetching)),
		neverProposed:
			enabled &&
			!invalidated &&
			query.data?.pages[0]?.proposals.length === 0,
	};
}
