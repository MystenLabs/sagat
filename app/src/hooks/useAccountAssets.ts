// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo } from 'react';

import { useNetwork } from '../contexts/NetworkContext';
import {
	accountAssetsState,
	coinUsdValue,
	pricesAvailableOn,
	pricingOnNetwork,
	sortBalances,
	totalUsdValue,
} from '../lib/coins';
import { useCoinDisplayDataMap } from './useCoinDisplayData';
import {
	useMultisigBalances,
	type Balance,
} from './useMultisigBalances';
import { useRecognizedCoins } from './useRecognizedCoins';

/**
 * The account's balances with what is known about each coin: sorted the
 * way the assets tab lists them, each one's USD value, and the total
 * across those that have a price. With `allPages` every balances page is
 * fetched, so the total and the largest holdings cover all coins.
 *
 * Prices come from the registry alone, so valuing and sorting never wait
 * on coin metadata. Display data (with the metadata fallback for coins
 * outside the registry) is fetched only for the first `displayCount`
 * balances and for `coinTypes`; without either `coinData` stays empty.
 */
export function useAccountAssets(
	address: string,
	{
		allPages = false,
		displayCount,
		coinTypes,
	}: {
		allPages?: boolean;
		displayCount?: number;
		coinTypes?: readonly string[];
	} = {},
) {
	const { network } = useNetwork();
	const query = useMultisigBalances(address);
	const {
		hasNextPage,
		isFetching,
		isError,
		isFetchNextPageError,
		fetchNextPage,
		refetch,
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

	const recognized = useRecognizedCoins();
	const usdValue = useCallback(
		(balance: Balance) => {
			const coin = recognized.map.get(balance.coinType);
			if (!coin) return null;
			return coinUsdValue(balance.balance, {
				priceUsd: pricingOnNetwork(network, coin).priceUsd,
				decimals: coin.decimals,
			});
		},
		[recognized.map, network],
	);
	const balances = useMemo(
		() => sortBalances(query.balances, usdValue),
		[query.balances, usdValue],
	);
	const value = useMemo(
		() => totalUsdValue(balances, usdValue),
		[balances, usdValue],
	);

	const shownCoinTypes = useMemo(
		() => [
			...balances
				.slice(0, displayCount ?? 0)
				.map((b) => b.coinType),
			...(coinTypes ?? []),
		],
		[balances, displayCount, coinTypes],
	);
	const coinData = useCoinDisplayDataMap(shownCoinTypes);

	const pricesAvailable = pricesAvailableOn(network);
	const state = accountAssetsState({
		balancesLoading: query.isLoading,
		balancesError: isError,
		hasData: !!query.data,
		// Not `allPages && …`: passing an option itself would make the
		// React Compiler treat `displayCount` as mutable.
		pagesLeft: allPages ? hasNextPage : false,
		pricesLoading: recognized.isLoading,
		pricesError: recognized.isError,
		pricesAvailable,
	});

	// A failed later page is fetched again on its own; anything else
	// reloads from the first page.
	const retry = useCallback(
		() =>
			void (isFetchNextPageError
				? fetchNextPage()
				: refetch()),
		[isFetchNextPageError, fetchNextPage, refetch],
	);

	// Fetches the price list and the balances again, for a fresh value.
	const refetchPrices = recognized.refetch;
	const refreshPrices = useCallback(
		() => void Promise.all([refetchPrices(), refetch()]),
		[refetchPrices, refetch],
	);

	return {
		query,
		balances,
		/** Display data for the first `displayCount` balances and `coinTypes`. */
		coinData: coinData.map,
		/** Whether the display data of `coinType` is still loading. */
		isCoinDataLoadingFor: coinData.isLoadingFor,
		/** Whether the display data of `coinType` failed to load. */
		isCoinDataErrorFor: coinData.isErrorFor,
		usdValue,
		value,
		pricesAvailable,
		...state,
		/** Loads what failed again: the first page or a later one. */
		retry,
		/** When the price list was last fetched, or null before it loads. */
		pricesUpdatedAt: recognized.data
			? recognized.dataUpdatedAt
			: null,
		refreshPrices,
		/** Whether the price list or the balances are being fetched. */
		refreshingPrices: recognized.isFetching || isFetching,
	};
}
