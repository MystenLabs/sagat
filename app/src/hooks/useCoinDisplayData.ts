// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useMemo } from 'react';

import { useNetwork } from '../contexts/NetworkContext';
import {
	buildCoinDisplayMap,
	fromMetadata,
	fromRecognized,
	selectFallbackCoinTypes,
	type CoinDisplayData,
} from '../lib/coinDisplay';
import {
	useCoinMetadata,
	useCoinMetadataMap,
} from './useCoinMetadata';
import { useRecognizedCoins } from './useRecognizedCoins';

export type { CoinDisplayData };

export function useCoinDisplayData(
	coinType: string | null | undefined,
) {
	const { network } = useNetwork();
	const recognizedQuery = useRecognizedCoins();
	const recognizedCoin = coinType
		? recognizedQuery.map.get(coinType)
		: undefined;
	const recognizedReady =
		recognizedQuery.isFetched || recognizedQuery.isError;

	const metadataQuery = useCoinMetadata(coinType, {
		enabled:
			!!coinType && recognizedReady && !recognizedCoin,
	});

	const data = useMemo(() => {
		if (!coinType) return undefined;
		if (recognizedCoin)
			return fromRecognized(recognizedCoin, network);
		if (metadataQuery.data)
			return fromMetadata(metadataQuery.data);
		return undefined;
	}, [
		coinType,
		recognizedCoin,
		metadataQuery.data,
		network,
	]);

	return {
		data,
		isLoading:
			recognizedQuery.isLoading || metadataQuery.isLoading,
		isError: metadataQuery.isError,
		error: metadataQuery.error,
	};
}

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
			recognizedQuery.isLoading ||
			metadataLoadingFor(coinType),
		[recognizedQuery.isLoading, metadataLoadingFor],
	);

	// Recognized errors stay silent — the metadata fallback covers them.
	return {
		map,
		/** The registry or some coin's metadata is still loading. */
		isLoading:
			recognizedQuery.isLoading ||
			fallbackMetadata.isLoading,
		/** The registry or `coinType`'s metadata is still loading. */
		isLoadingFor,
		isError: fallbackMetadata.isError,
		error: fallbackMetadata.error,
	};
}
