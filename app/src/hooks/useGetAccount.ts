// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { apiClient } from '@/lib/api';
import { QueryKeys } from '@/lib/queryKeys';

// An account with its proposers and signer sets.
export function useGetAccount(
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

			return apiClient.getAccount(address);
		},
		enabled: !!address && isCurrentAddressAuthenticated,
	});
}
