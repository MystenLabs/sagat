// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import type { SuiClientTypes } from '@mysten/sui/client';
import {
	useQueries,
	useQuery,
	type UseQueryOptions,
} from '@tanstack/react-query';

import { useNetwork } from '../contexts/NetworkContext';
import { QueryKeys } from '../lib/queryKeys';

export type CoinMetadata = SuiClientTypes.CoinMetadata;

// Coin metadata is effectively immutable on-chain, so we cache aggressively.
const COIN_METADATA_STALE_TIME = 24 * 60 * 60 * 1000; // 24h

/**
 * Fetches metadata (name, symbol, decimals, iconUrl, ...) for a single coin
 * type. The query is keyed by network, so switching networks transparently
 * refetches with the appropriate client.
 */
export function useCoinMetadata(
	coinType: string | undefined | null,
	options?: Pick<
		UseQueryOptions<CoinMetadata | null>,
		'enabled'
	>,
) {
	const client = useDAppKit().getClient();
	const { network } = useNetwork();

	return useQuery({
		queryKey: [QueryKeys.CoinMetadata, network, coinType],
		queryFn: async () => {
			const { coinMetadata } = await client.getCoinMetadata(
				{
					coinType: coinType!,
				},
			);
			return coinMetadata;
		},
		enabled: !!coinType && (options?.enabled ?? true),
		staleTime: COIN_METADATA_STALE_TIME,
		gcTime: COIN_METADATA_STALE_TIME,
	});
}

/**
 * Batched version of `useCoinMetadata` for fetching metadata for many coin
 * types at once (e.g. an assets list). Each coin type is its own React Query
 * entry so caches are shared with single-coin lookups elsewhere.
 */
export function useCoinMetadataMap(coinTypes: string[]) {
	const client = useDAppKit().getClient();
	const { network } = useNetwork();

	const results = useQueries({
		queries: coinTypes.map((coinType) => ({
			queryKey: [QueryKeys.CoinMetadata, network, coinType],
			queryFn: async () => {
				const { coinMetadata } =
					await client.getCoinMetadata({ coinType });
				return coinMetadata;
			},
			staleTime: COIN_METADATA_STALE_TIME,
			gcTime: COIN_METADATA_STALE_TIME,
		})),
	});

	const map = new Map<string, CoinMetadata | null>();
	coinTypes.forEach((coinType, idx) => {
		map.set(coinType, results[idx].data ?? null);
	});

	return {
		map,
		isLoading: results.some((r) => r.isLoading),
		isError: results.some((r) => r.isError),
	};
}
