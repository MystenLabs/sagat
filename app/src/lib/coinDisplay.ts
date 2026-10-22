// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';

import { pricingOnNetwork } from './coins';

export type CoinMetadata = SuiClientTypes.CoinMetadata;

export interface CoinPricing {
	priceUsd?: number | null;
	priceChange24hUsd?: number | null;
	/** 24h price change as a percentage (e.g. `5` means +5%). */
	priceChange24hPercentage?: number | null;
}

export interface CoinDisplayBase extends CoinPricing {
	name?: string | null;
	symbol?: string | null;
	iconUrl?: string | null;
	decimals?: number;
}

export interface RecognizedCoin extends CoinDisplayBase {
	coinType: string;
}

export interface CoinDisplayData extends CoinDisplayBase {
	recognized: boolean;
}

export function fromMetadata(
	metadata: CoinMetadata,
): CoinDisplayData {
	return {
		name: metadata.name,
		symbol: metadata.symbol,
		iconUrl: metadata.iconUrl,
		decimals: metadata.decimals,
		recognized: false,
	};
}

/** A registry entry for display on `network`, priced only on mainnet. */
export function fromRecognized(
	coin: RecognizedCoin,
	network: string,
): CoinDisplayData {
	const { coinType: _coinType, ...rest } = coin;
	return {
		...rest,
		...pricingOnNetwork(network, coin),
		recognized: true,
	};
}

/**
 * Picks the coin types that need an on-chain metadata fallback. Returns
 * `[]` while the recognized query is still in flight to avoid firing
 * RPCs we'd throw away as soon as the registry lands.
 */
export function selectFallbackCoinTypes(
	coinTypes: readonly string[],
	recognizedReady: boolean,
	recognizedMap: ReadonlyMap<string, unknown>,
): string[] {
	if (coinTypes.length === 0) return [];
	if (!recognizedReady) return [];
	return coinTypes.filter(
		(coinType) => !recognizedMap.has(coinType),
	);
}

export function buildCoinDisplayMap(
	coinTypes: readonly string[],
	recognizedMap: ReadonlyMap<string, RecognizedCoin>,
	metadataMap: ReadonlyMap<string, CoinMetadata | null>,
	network: string,
): Map<string, CoinDisplayData> {
	const out = new Map<string, CoinDisplayData>();
	for (const coinType of coinTypes) {
		const recognizedCoin = recognizedMap.get(coinType);
		if (recognizedCoin) {
			out.set(
				coinType,
				fromRecognized(recognizedCoin, network),
			);
			continue;
		}
		const metadata = metadataMap.get(coinType);
		if (metadata) {
			out.set(coinType, fromMetadata(metadata));
		}
	}
	return out;
}
