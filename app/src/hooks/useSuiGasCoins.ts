// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';

import { listSuiCoins } from '../components/assets/buildTransferTransaction';
import { useNetwork } from '../contexts/NetworkContext';
import { MAX_GAS_PAYMENT_OBJECTS } from '../lib/coins';
import { QueryKeys } from '../lib/queryKeys';

/** The SUI coins one transfer of the gas coin can spend. */
export interface SuiGasCoins {
	/** The balance of the first MAX_GAS_PAYMENT_OBJECTS coins. */
	value: bigint;
	/** True when `owner` holds more coins than that. */
	hasMore: boolean;
}

/**
 * The SUI coins of `owner` that a transfer of the gas coin spends. The
 * node pays gas with the first MAX_GAS_PAYMENT_OBJECTS coins in the order
 * they are listed here, plus the address balance.
 */
export function useSuiGasCoins(
	owner: string,
	{ enabled }: { enabled: boolean },
) {
	const client = useDAppKit().getClient();
	const { network } = useNetwork();

	return useQuery({
		queryKey: [QueryKeys.SuiGasCoins, network, owner],
		queryFn: async (): Promise<SuiGasCoins> => {
			const coins = await listSuiCoins(
				client,
				owner,
				MAX_GAS_PAYMENT_OBJECTS + 1,
			);
			return {
				value: coins
					.slice(0, MAX_GAS_PAYMENT_OBJECTS)
					.reduce(
						(sum, coin) => sum + BigInt(coin.balance),
						0n,
					),
				hasMore: coins.length > MAX_GAS_PAYMENT_OBJECTS,
			};
		},
		enabled,
	});
}
