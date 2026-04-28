// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from 'react';

import {
	buildCoinDisplayMap,
	selectFallbackCoinTypes,
	type CoinDisplayData,
} from '../lib/coinDisplay';
import { useCoinMetadataMap } from './useCoinMetadata';
import { useRecognizedCoins } from './useRecognizedCoins';

export type { CoinDisplayData };

export function useCoinDisplayDataMap(coinTypes: string[]) {
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
			),
		[
			uniqueCoinTypes,
			recognizedQuery.map,
			fallbackMetadata.map,
		],
	);

	// Recognized errors stay silent — the metadata fallback covers them.
	return {
		map,
		isLoading:
			recognizedQuery.isLoading ||
			fallbackMetadata.isLoading,
		isError: fallbackMetadata.isError,
		error: fallbackMetadata.error,
	};
}
