// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import type {
	Proposal,
	ProposalList,
} from '@mysten/sagat/v1';
import { isValidTransactionDigest } from '@mysten/sui/utils';
import {
	useQuery,
	type InfiniteData,
	type QueryClient,
} from '@tanstack/react-query';

import { content } from '@/content';
import { apiV1Client } from '@/lib/api';
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
			query.state.data?.status === ProposalStatus.PENDING
				? OPEN_PROPOSAL_REFETCH_INTERVAL
				: false,
	});
}

/** Writes a returned proposal into its read and the cached lists of its status, then refetches the lists. */
export async function writeProposal(
	queryClient: QueryClient,
	proposal: Proposal,
) {
	const key = proposalQueryKey(proposal.digest);
	// An older read in flight must not land over the write.
	await queryClient.cancelQueries({
		queryKey: key,
		exact: true,
	});
	queryClient.setQueryData(key, proposal);
	queryClient.setQueriesData<InfiniteData<ProposalList>>(
		{
			queryKey: [QueryKeys.Proposals],
			predicate: ({ queryKey }) =>
				proposalsListShows(queryKey, proposal.status),
		},
		(cached) => {
			if (
				!cached?.pages.some((page) =>
					page.proposals.some(
						(row) => row.digest === proposal.digest,
					),
				)
			)
				return cached;
			return {
				...cached,
				pages: cached.pages.map((page) => ({
					...page,
					proposals: page.proposals.map((row) =>
						row.digest === proposal.digest ? proposal : row,
					),
				})),
			};
		},
	);
	void queryClient.invalidateQueries({
		queryKey: [QueryKeys.Proposals],
	});
}
