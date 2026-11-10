// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';

import { apiClient } from '../lib/api';
import { MutationKeys, QueryKeys } from '../lib/queryKeys';

/**
 * Asks the API to check a proposal's digest on chain. Silent: its only
 * caller runs it after a failed execute, which has already told the
 * viewer; a refetched proposal shows the outcome.
 */
export function useVerifyProposal() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [MutationKeys.VerifyProposal],
		mutationFn: async (digest: string) => {
			return apiClient.verifyProposalByDigest(digest);
		},
		onSuccess: () => {
			// Invalidate all proposal-related queries
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposal],
			});
		},
	});
}
