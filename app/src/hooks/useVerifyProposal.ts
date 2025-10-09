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
		mutationFn: async (proposalId: number) => {
			return apiClient.verifyProposal(proposalId);
		},
		onSuccess: () => {
			// Invalidate all proposal-related queries
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
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
