import { useQuery } from '@tanstack/react-query';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { apiClient } from '@/lib/api';
import { QueryKeys } from '@/lib/queryKeys';

export function useGetMultisig(
	address: string | null | undefined,
) {
	const { isCurrentAddressAuthenticated, currentAddress } =
		useApiAuth();

	return useQuery({
		queryKey: [
			QueryKeys.Multisig,
			address,
			currentAddress?.address,
		],
		queryFn: async () => {
			if (!address) throw new Error('No address provided');

			return apiClient.getMultisig(address);
		},
		enabled: !!address && isCurrentAddressAuthenticated,
	});
}
