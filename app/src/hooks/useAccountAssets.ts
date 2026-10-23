// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo } from 'react';

import { useNetwork } from '../contexts/NetworkContext';
import {
	coinUsdValue,
	pricesAvailableOn,
	sortBalances,
	totalUsdValue,
	valuationReady,
} from '../lib/coins';
import { useCoinDisplayDataMap } from './useCoinDisplayData';
import {
	useMultisigBalances,
	type Balance,
} from './useMultisigBalances';

/**
 * The account's balances with what is known about each coin: sorted the
 * way the assets tab lists them, each one's USD value, and the total
 * across those that have a price. With `allPages` every balances page is
 * fetched, so the total and the largest holdings cover all coins.
 */
export function useAccountAssets(
	address: string,
	{ allPages = false }: { allPages?: boolean } = {},
) {
	const { network } = useNetwork();
	const query = useMultisigBalances(address);
	const {
		hasNextPage,
		isFetching,
		isError,
		fetchNextPage,
	} = query;

	useEffect(() => {
		if (
			allPages &&
			hasNextPage &&
			!isFetching &&
			!isError
		) {
			void fetchNextPage();
		}
	}, [
		allPages,
		hasNextPage,
		isFetching,
		isError,
		fetchNextPage,
	]);

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

	const pagesLeft = allPages && hasNextPage;
	// A failed refetch keeps the cached total; a failed later page would
	// leave it partial.
	const valueFailed = isError && (!query.data || pagesLeft);

	return {
		query,
		balances,
		coinData: coinData.map,
		/** Details (decimals, symbol) of some coin are still loading. */
		coinDataLoading: coinData.isLoading,
		usdValue,
		value,
		pricesAvailable: pricesAvailableOn(network),
		/** Balances or prices still loading, so `value` may change. */
		isLoading:
			!valueFailed &&
			!valuationReady({
				balancesLoading: query.isLoading,
				hasNextPage: pagesLeft,
				pricesLoading: coinData.isRecognizedLoading,
			}),
		/** The balances failed to load, so `value` means nothing. */
		isError: valueFailed,
	};
}
