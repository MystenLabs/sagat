// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import { parseRecognizedCoin } from '../src/hooks/useRecognizedCoins';

const SUI = '0x2::sui::SUI';

describe('parseRecognizedCoin', () => {
	test('rejects non-objects', () => {
		expect(parseRecognizedCoin(null)).toBeNull();
		expect(parseRecognizedCoin('hi')).toBeNull();
		expect(parseRecognizedCoin(42)).toBeNull();
	});

	test('rejects entries without a non-empty coinType', () => {
		expect(parseRecognizedCoin({})).toBeNull();
		expect(
			parseRecognizedCoin({ coinType: '' }),
		).toBeNull();
		expect(
			parseRecognizedCoin({ coinType: 123 }),
		).toBeNull();
	});

	test('extracts the documented fields', () => {
		const parsed = parseRecognizedCoin({
			coinType: SUI,
			name: 'Sui',
			symbol: 'SUI',
			iconUrl: 'https://example.test/sui.png',
			decimals: 9,
			priceUsd: 1.23,
			priceChange24hUsd: 0.01,
		});
		expect(parsed).toMatchObject({
			coinType: SUI,
			name: 'Sui',
			symbol: 'SUI',
			iconUrl: 'https://example.test/sui.png',
			decimals: 9,
			priceUsd: 1.23,
			priceChange24hUsd: 0.01,
		});
	});

	test('normalizes 24h change from a fraction to a percentage', () => {
		// The endpoint returns 0.05 for a +5% move; downstream code
		// only ever wants the percentage form, so the parser is the
		// single place that does the conversion.
		const parsed = parseRecognizedCoin({
			coinType: SUI,
			priceChange24hPercentage: 0.05,
		});
		expect(parsed?.priceChange24hPercentage).toBeCloseTo(
			5,
			12,
		);
	});

	test('handles negative 24h change correctly', () => {
		const parsed = parseRecognizedCoin({
			coinType: SUI,
			priceChange24hPercentage: -0.123,
		});
		expect(parsed?.priceChange24hPercentage).toBeCloseTo(
			-12.3,
			12,
		);
	});

	test('preserves nullable 24h change fields when explicitly null', () => {
		const parsed = parseRecognizedCoin({
			coinType: SUI,
			priceChange24hPercentage: null,
			priceUsd: null,
		});
		expect(parsed?.priceChange24hPercentage).toBeNull();
		expect(parsed?.priceUsd).toBeNull();
	});

	test('omits non-numeric numeric fields without throwing', () => {
		const parsed = parseRecognizedCoin({
			coinType: SUI,
			decimals: 'oops',
			priceUsd: 'oops',
			priceChange24hPercentage: Number.NaN,
		});
		expect(parsed?.decimals).toBeUndefined();
		expect(parsed?.priceUsd).toBeUndefined();
		expect(
			parsed?.priceChange24hPercentage,
		).toBeUndefined();
	});
});
