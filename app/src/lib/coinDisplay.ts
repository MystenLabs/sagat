// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';

import type { SuiNetwork } from '../contexts/NetworkContext';
import { formatCoinType, prettifyType } from './coin-type';
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
	network: SuiNetwork,
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
	network: SuiNetwork,
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

/**
 * A coin's symbol and name for display, falling back to its compact and
 * full type when its details are unknown.
 */
export function coinLabels(
	coinType: string,
	coinData:
		Pick<CoinDisplayBase, 'symbol' | 'name'> | undefined,
): { symbol: string; name: string } {
	return {
		symbol: coinData?.symbol ?? formatCoinType(coinType),
		name: coinData?.name ?? prettifyType(coinType),
	};
}

/** Whether two coin labels, such as a symbol and a name, read the same. */
export function sameCoinLabel(
	a: string,
	b: string,
): boolean {
	return a.toLowerCase() === b.toLowerCase();
}
