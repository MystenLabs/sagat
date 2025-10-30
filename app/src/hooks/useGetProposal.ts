// Copyright (c) Mysten Labs, Inc.
// Modifications Copyright (c) 2025 IOTA Stiftung
// SPDX-License-Identifier: Apache-2.0

import { isValidTransactionDigest } from '@iota/iota-sdk/utils';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api';
import { QueryKeys } from '@/lib/queryKeys';

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
	});
}
