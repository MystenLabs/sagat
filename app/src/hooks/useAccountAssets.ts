// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useMemo } from 'react';

import { useNetwork } from '../contexts/NetworkContext';
import {
	coinUsdValue,
	sortBalances,
	totalUsdValue,
} from '../lib/coins';
import { useCoinDisplayDataMap } from './useCoinDisplayData';
import {
	useMultisigBalances,
	type Balance,
} from './useMultisigBalances';

/**
 * The account's balances with what is known about each coin: sorted the
 * way the assets tab lists them, each one's USD value, and the total
 * across those that have a price.
 */
export function useAccountAssets(address: string) {
	const { isTestMode } = useNetwork();
	const query = useMultisigBalances(address);
	const coinTypes = useMemo(
		() => query.balances.map((b) => b.coinType),
		[query.balances],
	);
	const coinData = useCoinDisplayDataMap(coinTypes);
	const usdValue = useCallback(
		(balance: Balance) => {
			const coin = coinData.map.get(balance.coinType);
			return coinUsdValue(balance.balance, {
				priceUsd: coin?.priceUsd,
				decimals: coin?.decimals,
			});
		},
		[coinData.map],
	);
	const balances = useMemo(
		() => sortBalances(query.balances, usdValue),
		[query.balances, usdValue],
	);
	const value = useMemo(
		() => totalUsdValue(balances, usdValue),
		[balances, usdValue],
	);

	return {
		query,
		balances,
		coinData: coinData.map,
		usdValue,
		value,
		/** Prices are mainnet's, so elsewhere nothing has a USD value. */
		pricesAvailable: !isTestMode,
		/** Balances or coin details still loading, so `value` may grow. */
		isLoading: query.isLoading || coinData.isLoading,
		/** The balances failed to load, so `value` means nothing. */
		isError: query.isError,
	};
}
