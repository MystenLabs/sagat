// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { type RecognizedCoin } from '../lib/coinDisplay';
import { QueryKeys } from '../lib/queryKeys';

export type { RecognizedCoin };

const RECOGNIZED_COINS_URL =
	'https://apps-backend.sui.io/v2/recognized-coins';

function isRecord(
	value: unknown,
): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function toOptionalString(
	value: unknown,
): string | null | undefined {
	if (typeof value !== 'string') return undefined;
	return value;
}

function toOptionalNumber(
	value: unknown,
): number | undefined {
	if (typeof value !== 'number' || Number.isNaN(value))
		return undefined;
	return value;
}

function toOptionalNullableNumber(
	value: unknown,
): number | null | undefined {
	if (value === null) return null;
	if (typeof value !== 'number' || Number.isNaN(value))
		return undefined;
	return value;
}

function fractionToPercent(
	value: number | null | undefined,
): number | null | undefined {
	if (value == null) return value;
	return value * 100;
}

export function parseRecognizedCoin(
	entry: unknown,
): RecognizedCoin | null {
	if (!isRecord(entry)) return null;
	const coinType = entry.coinType;
	if (typeof coinType !== 'string' || !coinType.trim()) {
		return null;
	}

	// Endpoint returns 24h change as a fraction (0.05 = +5%); normalize.
	const percentageFraction = toOptionalNullableNumber(
		entry.priceChange24hPercentage,
	);

	return {
		coinType,
		name: toOptionalString(entry.name),
		symbol: toOptionalString(entry.symbol),
		iconUrl: toOptionalString(entry.iconUrl),
		decimals: toOptionalNumber(entry.decimals),
		priceUsd: toOptionalNullableNumber(entry.priceUsd),
		priceChange24hUsd: toOptionalNullableNumber(
			entry.priceChange24hUsd,
		),
		priceChange24hPercentage: fractionToPercent(
			percentageFraction,
		),
	};
}

export function useRecognizedCoins() {
	const query = useQuery({
		queryKey: [QueryKeys.RecognizedCoins],
		queryFn: async () => {
			const response = await fetch(RECOGNIZED_COINS_URL);
			if (!response.ok) {
				throw new Error(
					`Failed to load recognized coins (${response.status})`,
				);
			}

			const payload = (await response.json()) as unknown;
			if (
				!isRecord(payload) ||
				!Array.isArray(payload.coins)
			) {
				throw new Error(
					'Invalid recognized coins response',
				);
			}

			return payload.coins
				.map(parseRecognizedCoin)
				.filter((coin): coin is RecognizedCoin => !!coin);
		},
		staleTime: Infinity,
		gcTime: Infinity,
		retry: 2,
	});

	const map = useMemo(() => {
		const out = new Map<string, RecognizedCoin>();
		for (const coin of query.data ?? []) {
			out.set(coin.coinType, coin);
		}
		return out;
	}, [query.data]);

	return { ...query, map };
}
