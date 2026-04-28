// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	normalizeStructTag,
	SUI_TYPE_ARG,
} from '@mysten/sui/utils';
import { describe, expect, test } from 'vitest';

import {
	coinUsdValue,
	formatCoinAmount,
	formatUsdValue,
	isSuiCoinType,
	rawAmountToFloat,
	sortBalances,
	type SortableBalance,
} from '../src/lib/coins';

describe('isSuiCoinType', () => {
	test('matches the short canonical form', () => {
		expect(isSuiCoinType('0x2::sui::SUI')).toBe(true);
		expect(isSuiCoinType(SUI_TYPE_ARG)).toBe(true);
	});

	test('matches the fully-padded form returned by RPC', () => {
		expect(
			isSuiCoinType(normalizeStructTag(SUI_TYPE_ARG)),
		).toBe(true);
	});

	test('tolerates surrounding whitespace', () => {
		expect(isSuiCoinType('  0x2::sui::SUI  ')).toBe(true);
	});

	test('rejects other coin types', () => {
		expect(isSuiCoinType('0xdeadbeef::usdc::USDC')).toBe(
			false,
		);
		expect(isSuiCoinType('0x2::coin::Coin')).toBe(false);
	});

	test('rejects nullish or malformed input without throwing', () => {
		expect(isSuiCoinType(null)).toBe(false);
		expect(isSuiCoinType(undefined)).toBe(false);
		expect(isSuiCoinType('')).toBe(false);
		expect(isSuiCoinType('not a struct tag')).toBe(false);
	});
});

describe('formatCoinAmount', () => {
	test('zero', () => {
		expect(formatCoinAmount('0', 9)).toBe('0');
		expect(formatCoinAmount('0', 0)).toBe('0');
	});

	test('whole-number amounts get thousands separators', () => {
		expect(formatCoinAmount('1000000000', 9)).toBe('1');
		expect(formatCoinAmount('1234567890000000000', 9)).toBe(
			'1,234,567,890',
		);
	});

	test('mixed whole and fractional amounts', () => {
		expect(formatCoinAmount('1234500000', 9)).toBe(
			'1.2345',
		);
		expect(formatCoinAmount('1000000001', 9)).toBe(
			'1.000000001',
		);
	});

	test('strips trailing zeroes from the fractional part', () => {
		expect(formatCoinAmount('100000000', 9)).toBe('0.1');
		expect(formatCoinAmount('123450000', 9)).toBe(
			'0.12345',
		);
	});

	test('keeps leading zeroes in the fractional part', () => {
		expect(formatCoinAmount('5', 3)).toBe('0.005');
		expect(formatCoinAmount('50', 3)).toBe('0.05');
	});

	test('handles decimals = 0 (integer-only coins)', () => {
		expect(formatCoinAmount('1234567', 0)).toBe(
			'1,234,567',
		);
	});

	test('preserves precision beyond Number.MAX_SAFE_INTEGER', () => {
		expect(
			formatCoinAmount('1000000000000000000', 18),
		).toBe('1');
		expect(formatCoinAmount('1', 18)).toBe(
			'0.000000000000000001',
		);
	});

	test('formats negative amounts', () => {
		expect(formatCoinAmount('-1500000000', 9)).toBe('-1.5');
		expect(formatCoinAmount('-1', 18)).toBe(
			'-0.000000000000000001',
		);
	});

	test('returns the raw input for unparseable values', () => {
		expect(formatCoinAmount('not-a-number', 9)).toBe(
			'not-a-number',
		);
	});
});

describe('formatUsdValue', () => {
	test('uses 2 fraction digits for values >= $1', () => {
		expect(formatUsdValue(1)).toBe('$1.00');
		expect(formatUsdValue(1234.5)).toBe('$1,234.50');
	});

	test('uses 4 fraction digits for sub-dollar values', () => {
		expect(formatUsdValue(0.1234)).toBe('$0.1234');
		expect(formatUsdValue(0.00005)).toBe('$0.0001');
	});

	test('formats negative values', () => {
		expect(formatUsdValue(-2.5)).toBe('-$2.50');
		expect(formatUsdValue(-0.5)).toBe('-$0.5000');
	});

	test('renders exact zero with the standard 2 fraction digits', () => {
		expect(formatUsdValue(0)).toBe('$0.00');
	});
});

describe('rawAmountToFloat', () => {
	test('parses small fractional amounts', () => {
		expect(rawAmountToFloat('1500000000', 9)).toBeCloseTo(
			1.5,
			12,
		);
		expect(rawAmountToFloat('1', 9)).toBeCloseTo(1e-9, 18);
	});

	test('handles zero decimals', () => {
		expect(rawAmountToFloat('42', 0)).toBe(42);
	});

	test('handles negative amounts', () => {
		expect(rawAmountToFloat('-2500000000', 9)).toBeCloseTo(
			-2.5,
			12,
		);
	});

	test('returns null for unparseable input', () => {
		expect(rawAmountToFloat('not-a-number', 9)).toBeNull();
	});
});

describe('coinUsdValue', () => {
	test('multiplies amount by price', () => {
		expect(
			coinUsdValue('1500000000', {
				decimals: 9,
				priceUsd: 2,
			}),
		).toBeCloseTo(3, 12);
	});

	test('returns null when raw amount is missing', () => {
		expect(
			coinUsdValue(null, { decimals: 9, priceUsd: 1 }),
		).toBeNull();
		expect(
			coinUsdValue(undefined, {
				decimals: 9,
				priceUsd: 1,
			}),
		).toBeNull();
	});

	test('returns null when price or decimals are missing', () => {
		expect(
			coinUsdValue('1', { decimals: 9, priceUsd: null }),
		).toBeNull();
		expect(
			coinUsdValue('1', {
				decimals: 9,
				priceUsd: undefined,
			}),
		).toBeNull();
		expect(
			coinUsdValue('1', {
				decimals: undefined,
				priceUsd: 1,
			}),
		).toBeNull();
	});

	test('returns null when amount is unparseable', () => {
		expect(
			coinUsdValue('garbage', {
				decimals: 9,
				priceUsd: 1,
			}),
		).toBeNull();
	});
});

describe('sortBalances', () => {
	const SUI_PADDED = normalizeStructTag(SUI_TYPE_ARG);
	const USDC = '0xa1::usdc::USDC';
	const FOO = '0xb2::foo::FOO';
	const BAR = '0xc3::bar::BAR';

	function balance(
		coinType: string,
		amount: string,
	): SortableBalance {
		return { coinType, balance: amount };
	}

	test('puts SUI first regardless of USD value', () => {
		const sui = balance(SUI_PADDED, '1');
		const usdc = balance(USDC, '1000000');
		const result = sortBalances([usdc, sui], (b) =>
			b.coinType === USDC ? 1_000_000 : 0.01,
		);
		expect(result[0].coinType).toBe(SUI_PADDED);
	});

	test('matches SUI in either short or padded form', () => {
		const suiShort = balance('0x2::sui::SUI', '1');
		const usdc = balance(USDC, '1');
		const result = sortBalances(
			[usdc, suiShort],
			() => null,
		);
		expect(result[0]).toBe(suiShort);
	});

	test('orders by USD value descending when both are known', () => {
		const a = balance(USDC, '1');
		const b = balance(FOO, '1');
		const c = balance(BAR, '1');
		const usd: Record<string, number> = {
			[USDC]: 5,
			[FOO]: 100,
			[BAR]: 0.5,
		};
		const result = sortBalances(
			[a, b, c],
			(x) => usd[x.coinType],
		);
		expect(result.map((r) => r.coinType)).toEqual([
			FOO,
			USDC,
			BAR,
		]);
	});

	test('places coins with USD value before coins without', () => {
		const priced = balance(USDC, '1');
		const unpriced = balance(FOO, '1');
		const result = sortBalances([unpriced, priced], (b) =>
			b.coinType === USDC ? 1 : null,
		);
		expect(result[0]).toBe(priced);
		expect(result[1]).toBe(unpriced);
	});

	test('falls back to raw balance descending when USD is unknown for both', () => {
		const small = balance(USDC, '1');
		const large = balance(FOO, '1000');
		const result = sortBalances([small, large], () => null);
		expect(result[0]).toBe(large);
		expect(result[1]).toBe(small);
	});

	test('falls back to lexical coinType when balances tie', () => {
		const a = balance(USDC, '1'); // 0xa1...
		const b = balance(FOO, '1'); // 0xb2...
		const c = balance(BAR, '1'); // 0xc3...
		const result = sortBalances([c, a, b], () => null);
		expect(result.map((r) => r.coinType)).toEqual([
			USDC,
			FOO,
			BAR,
		]);
	});

	test('treats NaN/Infinity USD values as unknown', () => {
		const a = balance(USDC, '1');
		const b = balance(FOO, '1000');
		const result = sortBalances([a, b], (x) =>
			x.coinType === USDC
				? Number.NaN
				: Number.POSITIVE_INFINITY,
		);
		expect(result[0]).toBe(b);
	});

	test('does not mutate the input array', () => {
		const list = [
			balance(USDC, '1'),
			balance(SUI_PADDED, '2'),
		];
		const snapshot = [...list];
		sortBalances(list, () => null);
		expect(list).toEqual(snapshot);
	});

	test('returns an empty array for empty input', () => {
		expect(sortBalances([], () => null)).toEqual([]);
	});

	test('handles non-numeric balance strings by falling back to lexical sort', () => {
		const a = balance(USDC, 'not-a-bigint');
		const b = balance(FOO, 'also-bad');
		const result = sortBalances([a, b], () => null);
		expect(result.map((r) => r.coinType)).toEqual([
			USDC,
			FOO,
		]);
	});
});
