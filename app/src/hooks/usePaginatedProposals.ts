import { ProposalStatus } from '@mysten/sagat';
import { useInfiniteQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api';
import { QueryKeys } from '@/lib/queryKeys';

interface UsePaginatedProposalsParams {
	multisigAddress: string;
	network: string;
	status?: ProposalStatus;
	perPage?: number;
	enabled?: boolean;
}

export function usePaginatedProposals({
	multisigAddress,
	network,
	status,
	perPage = 10,
	enabled = true,
}: UsePaginatedProposalsParams) {
	return useInfiniteQuery({
		queryKey: [
			QueryKeys.Proposals,
			status !== undefined ? ProposalStatus[status] : 'all',
			multisigAddress,
			network,
			perPage,
		],
		queryFn: ({ pageParam }) =>
			apiClient.getProposals(multisigAddress, network, {
				status,
				nextCursor: pageParam,
				perPage,
			}),
		initialPageParam: undefined as number | undefined,
		getNextPageParam: (lastPage) =>
			lastPage.hasNextPage && lastPage.nextCursor
				? Number(lastPage.nextCursor)
				: undefined,
		enabled: enabled && !!multisigAddress && !!network,
		refetchInterval: 30000, // Refetch first page every 30 seconds
		staleTime: 0, // Consider data stale immediately to ensure fresh data
	});
}
