// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ProposalStatusName } from '@mysten/sagat/v1';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { useInfiniteQuery } from '@tanstack/react-query';

import { apiV1Client } from '@/lib/api';
import { type SuiNetwork } from '@/lib/network';
import { QueryKeys } from '@/lib/queryKeys';

/**
 * Proposals per page. The overview and the proposals tab both ask for this
 * many, so they share one cached query.
 */
export const PROPOSALS_PAGE_SIZE = 10;

interface UsePaginatedProposalsParams {
	multisigAddress: string;
	network: SuiNetwork;
	status?: ProposalStatusName;
	perPage?: number;
	enabled?: boolean;
}

/** The cache key of one proposals list. */
export function proposalsQueryKey({
	multisigAddress,
	network,
	status,
	perPage = PROPOSALS_PAGE_SIZE,
}: Omit<UsePaginatedProposalsParams, 'enabled'>) {
	return [
		QueryKeys.Proposals,
		status ?? 'all',
		multisigAddress,
		network,
		perPage,
	];
}

export function proposalsListShows(
	queryKey: readonly unknown[],
	status: ProposalStatusName,
) {
	const listed = queryKey[1];
	return listed === 'all' || listed === status;
}

export function usePaginatedProposals({
	multisigAddress,
	network,
	status,
	perPage = PROPOSALS_PAGE_SIZE,
	enabled = true,
}: UsePaginatedProposalsParams) {
	return useInfiniteQuery({
		queryKey: proposalsQueryKey({
			multisigAddress,
			network,
			status,
			perPage,
		}),
		queryFn: ({ pageParam }) =>
			apiV1Client.getProposals({
				accountAddress:
					normalizeSuiAddress(multisigAddress),
				network,
				status,
				nextCursor: pageParam,
				perPage,
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) =>
			lastPage.hasNextPage && lastPage.nextCursor
				? lastPage.nextCursor
				: undefined,
		enabled: enabled && !!multisigAddress && !!network,
		refetchInterval: 30000, // Refetch first page every 30 seconds
		staleTime: 0, // Consider data stale immediately to ensure fresh data
	});
}
