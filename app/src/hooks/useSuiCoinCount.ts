// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';

import { listSuiCoins } from '../components/assets/buildTransferTransaction';
import { useNetwork } from '../contexts/NetworkContext';
import { MAX_GAS_PAYMENT_OBJECTS } from '../lib/coins';
import { QueryKeys } from '../lib/queryKeys';

/**
 * How many SUI coins `owner` holds, counted up to
 * MAX_GAS_PAYMENT_OBJECTS: enough to tell whether the transfer pays gas
 * with the coins itself.
 */
export function useSuiCoinCount(
	owner: string,
	{ enabled }: { enabled: boolean },
) {
	const client = useDAppKit().getClient();
	const { network } = useNetwork();

	return useQuery({
		queryKey: [QueryKeys.SuiCoinCount, network, owner],
		queryFn: async () =>
			(
				await listSuiCoins(
					client,
					owner,
					MAX_GAS_PAYMENT_OBJECTS,
				)
			).length,
		enabled,
	});
}
