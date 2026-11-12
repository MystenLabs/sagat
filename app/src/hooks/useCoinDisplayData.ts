// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useMemo } from 'react';

import { useNetwork } from '../contexts/NetworkContext';
import {
	buildCoinDisplayMap,
	isVerifiedCoin,
	selectFallbackCoinTypes,
	type CoinDisplayData,
} from '../lib/coinDisplay';
import { isSuiCoinType } from '../lib/coins';
import { useCoinMetadataMap } from './useCoinMetadata';
import { useRecognizedCoins } from './useRecognizedCoins';

export type { CoinDisplayData };

export function useCoinDisplayDataMap(coinTypes: string[]) {
	const { network } = useNetwork();
	const recognizedQuery = useRecognizedCoins();
	const uniqueCoinTypes = useMemo(
		() => Array.from(new Set(coinTypes)),
		[coinTypes],
	);

	const recognizedReady =
		recognizedQuery.isFetched || recognizedQuery.isError;
	const fallbackCoinTypes = useMemo(
		() =>
			selectFallbackCoinTypes(
				uniqueCoinTypes,
				recognizedReady,
				recognizedQuery.map,
			),
		[uniqueCoinTypes, recognizedReady, recognizedQuery.map],
	);

	const fallbackMetadata = useCoinMetadataMap(
		fallbackCoinTypes,
	);

	const map = useMemo(
		() =>
			buildCoinDisplayMap(
				uniqueCoinTypes,
				recognizedQuery.map,
				fallbackMetadata.map,
				network,
			),
		[
			uniqueCoinTypes,
			recognizedQuery.map,
			fallbackMetadata.map,
			network,
		],
	);

	const metadataLoadingFor = fallbackMetadata.isLoadingFor;
	const isLoadingFor = useCallback(
		(coinType: string) =>
			recognizedQuery.isPending ||
			metadataLoadingFor(coinType),
		[recognizedQuery.isPending, metadataLoadingFor],
	);

	const hasRegistry = !!recognizedQuery.data;
	const registryFailed = recognizedQuery.isError;
	const recognizedMap = recognizedQuery.map;
	const isVerified = useCallback(
		(coinType: string) => {
			if (hasRegistry)
				return isVerifiedCoin(coinType, recognizedMap);
			if (registryFailed) return isSuiCoinType(coinType);
			return undefined;
		},
		[hasRegistry, registryFailed, recognizedMap],
	);

	// Recognized errors stay silent — the metadata fallback covers them.
	return {
		map,
		/**
		 * Whether `coinType` is SUI or in the registry; only SUI when the
		 * registry failed, `undefined` while it loads.
		 */
		isVerified,
		/** The registry or some coin's metadata is still loading. */
		isLoading:
			recognizedQuery.isPending ||
			fallbackMetadata.isLoading,
		/** The registry or `coinType`'s metadata is still loading. */
		isLoadingFor,
		/** `coinType`'s metadata, its only source, failed to load. */
		isErrorFor: fallbackMetadata.isErrorFor,
		isError: fallbackMetadata.isError,
		error: fallbackMetadata.error,
	};
}
