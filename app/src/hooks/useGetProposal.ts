import { isValidTransactionDigest } from '@mysten/sui/utils';
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
