import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

export function useVerifyProposal() {
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
			toast.error(
				`Failed to verify proposal: ${error.message}`,
			);
		},
	});
}
