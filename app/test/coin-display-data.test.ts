// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import {
	buildCoinDisplayMap,
	selectFallbackCoinTypes,
	type CoinMetadata,
	type RecognizedCoin,
} from '../src/lib/coinDisplay';

const SUI = '0x2::sui::SUI';
const USDC = '0xa1::usdc::USDC';
const FOO = '0xb2::foo::FOO';

function recognized(
	coinType: string,
	overrides: Partial<RecognizedCoin> = {},
): RecognizedCoin {
	return {
		coinType,
		name: 'Recognized',
		symbol: 'REC',
		iconUrl: 'https://example.test/rec.png',
		decimals: 9,
		priceUsd: 1.5,
		priceChange24hUsd: 0.05,
		priceChange24hPercentage: 3,
		...overrides,
	};
}

function metadata(
	overrides: Partial<CoinMetadata> = {},
): CoinMetadata {
	return {
		name: 'Metadata',
		symbol: 'META',
		iconUrl: 'https://example.test/meta.png',
		decimals: 6,
		description: '',
		...(overrides as Partial<CoinMetadata>),
	} as CoinMetadata;
}

describe('selectFallbackCoinTypes', () => {
	test('returns empty when no coin types are requested', () => {
		expect(
			selectFallbackCoinTypes([], true, new Map()),
		).toEqual([]);
		expect(
			selectFallbackCoinTypes([], false, new Map()),
		).toEqual([]);
	});

	test('waits (returns empty) while recognized is still loading', () => {
		// We deliberately do not pre-fetch metadata for everything
		// while the registry is in flight: as soon as it resolves,
		// most of those requests would be discarded.
		expect(
			selectFallbackCoinTypes(
				[SUI, USDC, FOO],
				false,
				new Map(),
			),
		).toEqual([]);
	});

	test('falls back to metadata for everything when the recognized fetch settled with no entries (e.g. errored)', () => {
		expect(
			selectFallbackCoinTypes(
				[SUI, USDC, FOO],
				true,
				new Map(),
			),
		).toEqual([SUI, USDC, FOO]);
	});

	test('skips coins that are already covered by the recognized list', () => {
		const recMap = new Map<string, RecognizedCoin>([
			[SUI, recognized(SUI)],
			[USDC, recognized(USDC)],
		]);
		expect(
			selectFallbackCoinTypes(
				[SUI, USDC, FOO],
				true,
				recMap,
			),
		).toEqual([FOO]);
	});

	test('returns an empty list when recognized covers all requested coins', () => {
		const recMap = new Map<string, RecognizedCoin>([
			[SUI, recognized(SUI)],
			[USDC, recognized(USDC)],
		]);
		expect(
			selectFallbackCoinTypes([SUI, USDC], true, recMap),
		).toEqual([]);
	});
});

describe('buildCoinDisplayMap', () => {
	test('prefers recognized data when both sources have an entry', () => {
		const recMap = new Map([[SUI, recognized(SUI)]]);
		const metaMap = new Map([[SUI, metadata()]]);
		const result = buildCoinDisplayMap(
			[SUI],
			recMap,
			metaMap,
		);
		const entry = result.get(SUI);
		expect(entry?.recognized).toBe(true);
		expect(entry?.symbol).toBe('REC');
		expect(entry?.priceUsd).toBe(1.5);
	});

	test('falls back to on-chain metadata when there is no recognized entry', () => {
		const result = buildCoinDisplayMap(
			[USDC],
			new Map(),
			new Map([[USDC, metadata({ symbol: 'USDC' })]]),
		);
		const entry = result.get(USDC);
		expect(entry?.recognized).toBe(false);
		expect(entry?.symbol).toBe('USDC');
		expect(entry?.priceUsd).toBeUndefined();
	});

	test('still resolves all coins via metadata when the recognized map is empty (registry down or errored)', () => {
		const metaMap = new Map([
			[SUI, metadata({ symbol: 'SUI' })],
			[USDC, metadata({ symbol: 'USDC' })],
			[FOO, metadata({ symbol: 'FOO' })],
		]);
		const result = buildCoinDisplayMap(
			[SUI, USDC, FOO],
			new Map(),
			metaMap,
		);
		expect(result.size).toBe(3);
		expect(result.get(SUI)?.symbol).toBe('SUI');
		expect(result.get(USDC)?.symbol).toBe('USDC');
		expect(result.get(FOO)?.symbol).toBe('FOO');
		expect(
			Array.from(result.values()).every(
				(d) => d.recognized === false,
			),
		).toBe(true);
	});

	test('mixes recognized and metadata sources within a single result', () => {
		const recMap = new Map([[USDC, recognized(USDC)]]);
		const metaMap = new Map([
			[SUI, metadata({ symbol: 'SUI' })],
			[FOO, metadata({ symbol: 'FOO' })],
		]);
		const result = buildCoinDisplayMap(
			[SUI, USDC, FOO],
			recMap,
			metaMap,
		);
		expect(result.get(SUI)?.recognized).toBe(false);
		expect(result.get(USDC)?.recognized).toBe(true);
		expect(result.get(FOO)?.recognized).toBe(false);
	});

	test('omits coins that have no entry in either source', () => {
		const result = buildCoinDisplayMap(
			[SUI, FOO],
			new Map([[SUI, recognized(SUI)]]),
			new Map(),
		);
		expect(result.has(SUI)).toBe(true);
		expect(result.has(FOO)).toBe(false);
	});

	test('treats a `null` metadata entry as missing rather than usable', () => {
		const result = buildCoinDisplayMap(
			[FOO],
			new Map(),
			new Map([[FOO, null]]),
		);
		expect(result.has(FOO)).toBe(false);
	});
});
