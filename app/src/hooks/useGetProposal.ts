// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { isValidTransactionDigest } from '@mysten/sui/utils';
import {
	useQuery,
	type InfiniteData,
	type QueryClient,
} from '@tanstack/react-query';

import { content } from '@/content';
import { apiV1Client } from '@/lib/api';
import {
	type AppProposal,
	type AppProposalList,
} from '@/lib/proposal-integrity';
import { QueryKeys } from '@/lib/queryKeys';

import { proposalsListShows } from './usePaginatedProposals';

// Co-signers sign from their own sessions, so an open proposal polls for
// their signatures the way the proposals list does.
const OPEN_PROPOSAL_REFETCH_INTERVAL = 10_000;

function proposalQueryKey(digest: string | null) {
	return [QueryKeys.Proposal, digest] as const;
}

export function useGetProposal(digest: string | null) {
	return useQuery({
		queryKey: proposalQueryKey(digest),
		queryFn: async () => {
			if (!digest) throw new Error('No digest provided');
			if (!isValidTransactionDigest(digest))
				throw new Error(
					content.proposal.load.invalidDigest,
				);
			return apiV1Client.getProposalByDigest(digest);
		},
		enabled: !!digest,
		retry: false, // max 1 retry.
		refetchInterval: (query) =>
			query.state.data?.status === 'PENDING'
				? OPEN_PROPOSAL_REFETCH_INTERVAL
				: false,
	});
}

/** Writes a returned proposal into its read and the cached lists of its status, drops it from the others, then refetches the lists. */
export async function writeProposal(
	queryClient: QueryClient,
	proposal: AppProposal,
) {
	const key = proposalQueryKey(proposal.digest);
	// An older read in flight must not land over the write.
	await queryClient.cancelQueries({
		queryKey: key,
		exact: true,
	});
	queryClient.setQueryData(key, proposal);
	// Lists of another status drop the row instead; none gains one.
	for (const [
		queryKey,
		cached,
	] of queryClient.getQueriesData<
		InfiniteData<AppProposalList>
	>({ queryKey: [QueryKeys.Proposals] }))
		if (cached)
			queryClient.setQueryData(queryKey, {
				...cached,
				pages: cached.pages.map((page) => ({
					...page,
					proposals: page.proposals.flatMap((row) =>
						row.digest !== proposal.digest
							? [row]
							: proposalsListShows(
										queryKey,
										proposal.status,
								  )
								? [proposal]
								: [],
					),
				})),
			});
	void queryClient.invalidateQueries({
		queryKey: [QueryKeys.Proposals],
	});
}
