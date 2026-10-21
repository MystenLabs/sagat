// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { useInfiniteQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api';
import { QueryKeys } from '@/lib/queryKeys';

interface UsePaginatedProposalsParams {
	accountAddress: string;
	network: string;
	status?: ProposalStatus;
	perPage?: number;
	enabled?: boolean;
}

export function usePaginatedProposals({
	accountAddress,
	network,
	status,
	perPage = 10,
	enabled = true,
}: UsePaginatedProposalsParams) {
	return useInfiniteQuery({
		queryKey: [
			QueryKeys.Proposals,
			status !== undefined ? ProposalStatus[status] : 'all',
			accountAddress,
			network,
			perPage,
		],
		queryFn: ({ pageParam }) =>
			apiClient.getProposals(accountAddress, network, {
				status,
				nextCursor: pageParam,
				perPage,
			}),
		initialPageParam: undefined as number | undefined,
		getNextPageParam: (lastPage) =>
			lastPage.hasNextPage && lastPage.nextCursor
				? Number(lastPage.nextCursor)
				: undefined,
		enabled: enabled && !!accountAddress && !!network,
		refetchInterval: 30000, // Refetch first page every 30 seconds
		staleTime: 0, // Consider data stale immediately to ensure fresh data
	});
}
