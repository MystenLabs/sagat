// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { isValidTransactionDigest } from '@mysten/sui/utils';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api';
import { QueryKeys } from '@/lib/queryKeys';

// Co-signers sign from their own sessions, so an open proposal polls for
// their signatures the way the proposals list does.
const OPEN_PROPOSAL_REFETCH_INTERVAL = 10_000;

export function useGetProposal(digest: string | null) {
	return useQuery({
		queryKey: [QueryKeys.Proposal, digest],
		queryFn: async () => {
			if (!digest) throw new Error('No digest provided');
			if (!isValidTransactionDigest(digest))
				throw new Error('Invalid digest');
			return apiClient.getProposalByDigest(digest);
		},
		enabled: !!digest,
		retry: false, // max 1 retry.
		refetchInterval: (query) =>
			query.state.data?.status === ProposalStatus.PENDING
				? OPEN_PROPOSAL_REFETCH_INTERVAL
				: false,
	});
}
