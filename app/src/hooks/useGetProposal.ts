import { isValidTransactionDigest } from '@mysten/sui/utils';
import { useQuery } from '@tanstack/react-query';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { apiClient } from '@/lib/api';
import { QueryKeys } from '@/lib/queryKeys';

export function useGetProposal(
	digest: string | null,
) {
	const { isCurrentAddressAuthenticated, currentAddress } = useApiAuth();
	return useQuery({
		queryKey: [QueryKeys.Proposal, digest, currentAddress?.address],
		queryFn: async () => {
			if (!digest) throw new Error('No digest provided');
			if (!isValidTransactionDigest(digest))
				throw new Error('Invalid digest');
			return apiClient.getProposalByDigest(digest);
		},
		enabled:
			!!digest &&
			isCurrentAddressAuthenticated,
		retry: false, // max 1 retry.
	});
}
