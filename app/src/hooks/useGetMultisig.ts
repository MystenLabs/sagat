// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { normalizeSuiAddress } from '@mysten/sui/utils';
import { useQuery } from '@tanstack/react-query';

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { apiV1Client } from '@/lib/api';
import { QueryKeys } from '@/lib/queryKeys';
import { toUserMultisig } from '@/lib/user-multisig';

/** The pod on the selected network as the signed-in key sees it, with rule 1 applied. */
export function useGetMultisig(
	address: string | null | undefined,
) {
	const { isCurrentAddressAuthenticated, currentAddress } =
		useApiAuth();
	const { network } = useNetwork();

	return useQuery({
		queryKey: [
			QueryKeys.Multisig,
			address,
			network,
			currentAddress?.address,
		],
		queryFn: async () => {
			if (!address) throw new Error('No address provided');
			if (!currentAddress)
				throw new Error(content.errors.noWalletConnected);

			return toUserMultisig(
				await apiV1Client.getAccount(
					normalizeSuiAddress(address),
					network,
				),
				currentAddress,
			);
		},
		enabled: !!address && isCurrentAddressAuthenticated,
	});
}
