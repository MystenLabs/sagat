// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

/**
 * Records a proposal's outcome on chain, and the address it was executed
 * via. `/v1` accepts whichever signer set executed it, so it refuses
 * mainly a transaction that is not on chain yet. With `quiet`, failures
 * show no toast: the caller only checks whether someone else executed it.
 */
export function useVerifyProposal({
	quiet = false,
}: { quiet?: boolean } = {}) {
	const queryClient = useQueryClient();

	return useMutation({
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
			toast.success('Proposal verified successfully!');
		},
		onError: (error: Error) => {
			if (quiet) return;
			toast.error(
				`Failed to verify proposal: ${error.message}`,
			);
		},
	});
}
