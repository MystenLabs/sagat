// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo } from 'react';

import { useNetwork } from '../contexts/NetworkContext';
import { isVerifiedCoin } from '../lib/coinDisplay';
import {
	accountAssetsState,
	coinUsdValue,
	pricingOnNetwork,
	sortBalances,
	totalUsdValue,
} from '../lib/coins';
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
 * on coin metadata. No display data is fetched here: whoever shows a coin
 * looks up its own.
 */
export function useAccountAssets(
	address: string,
	{
		allPages = false,
	}: {
		allPages?: boolean;
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
				priceUsd: pricingOnNetwork(
					network,
					balance.coinType,
					coin,
				).priceUsd,
				decimals: coin.decimals,
			});
		},
		[recognized.map, network],
	);
	const isVerified = useCallback(
		(coinType: string) =>
			isVerifiedCoin(coinType, recognized.map),
		[recognized.map],
	);
	const recognizedCoin = useCallback(
		(coinType: string) => recognized.map.get(coinType),
		[recognized.map],
	);
	const balances = useMemo(
		() => sortBalances(query.balances, usdValue),
		[query.balances, usdValue],
	);
	const value = useMemo(
		() => totalUsdValue(balances, usdValue),
		[balances, usdValue],
	);

	// Without the registry no coin can be told unverified: all are listed.
	const verifiedKnown = !!recognized.data;
	const [listedBalances, unverifiedBalances] = useMemo<
		[Balance[], Balance[]]
	>(
		() =>
			verifiedKnown
				? [
						balances.filter((b) => isVerified(b.coinType)),
						balances.filter((b) => !isVerified(b.coinType)),
					]
				: [balances, []],
		[balances, isVerified, verifiedKnown],
	);

	const state = accountAssetsState({
		balancesPending: query.isPending,
		balancesError: isError,
		hasData: !!query.data,
		// Not `allPages && …`: passing the option itself on would make the
		// React Compiler treat the options as mutable.
		pagesLeft: allPages ? hasNextPage : false,
		pricesPending: recognized.isPending,
		// A failed refetch keeps the loaded price list, the way balances do.
		pricesError: recognized.isError && !recognized.data,
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
		/** The balances outside the unverified group, as sorted. */
		listedBalances,
		/** The unverified coins' balances, once the registry says which. */
		unverifiedBalances,
		usdValue,
		/**
		 * Whether `coinType` is SUI or a coin the registry recognises. Only
		 * meaningful once `verifiedKnown`.
		 */
		isVerified,
		/** The registry's entry for `coinType`, if it has one. */
		recognizedCoin,
		/** The registry, which says which coins are verified, has no answer yet. */
		verifiedLoading: recognized.isPending,
		/**
		 * Whether the registry has loaded, so coins can be told verified or
		 * not. False while it loads and when it failed without data.
		 */
		verifiedKnown,
		value,
		...state,
		/** Everything loaded and the account holds no coins at all. */
		noBalances:
			!state.isLoading &&
			!state.isError &&
			balances.length === 0,
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
