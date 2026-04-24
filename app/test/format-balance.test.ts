// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import {
	formatBalance,
	formatInputAmount,
	getMaxInputAmount,
	parseAmount,
} from '../src/components/assets/formatBalance';

describe('parseAmount', () => {
	test('parses plain decimal input', () => {
		expect(parseAmount('1.5', 9)).toBe(1_500_000_000n);
	});

	test('accepts grouped display strings', () => {
		expect(parseAmount('1,234.567', 3)).toBe(1_234_567n);
	});

	test('accepts leading and trailing decimal points', () => {
		expect(parseAmount('.5', 9)).toBe(500_000_000n);
		expect(parseAmount('1.', 9)).toBe(1_000_000_000n);
	});

	test('rejects malformed grouping', () => {
		expect(parseAmount('12,34.56', 2)).toBeNull();
		expect(parseAmount('1,2,3', 0)).toBeNull();
	});

	test('rejects too many fractional digits', () => {
		expect(parseAmount('1.234', 2)).toBeNull();
	});

	test('rejects empty and invalid input', () => {
		expect(parseAmount('', 9)).toBeNull();
		expect(parseAmount('.', 9)).toBeNull();
		expect(parseAmount('abc', 9)).toBeNull();
		expect(parseAmount('-1', 9)).toBeNull();
	});

	test('parses very large bigint-backed values', () => {
		expect(
			parseAmount('123,456,789,123,456.789', 3),
		).toBe(123_456_789_123_456_789n);
	});
});

describe('format helpers', () => {
	test('formats balances for display with grouping', () => {
		expect(formatBalance('1234567890', 6)).toBe(
			'1,234.56789',
		);
	});

	test('formats input amounts without grouping', () => {
		expect(formatInputAmount('1234567890', 6)).toBe(
			'1234.56789',
		);
	});

	test('computes a parser-safe max amount after reserving gas', () => {
		expect(
			getMaxInputAmount('200000000', 9, '50000000'),
		).toBe('0.15');
	});

	test('returns null when nothing remains after reservation', () => {
		expect(
			getMaxInputAmount('50000000', 9, '50000000'),
		).toBeNull();
		expect(
			getMaxInputAmount('49999999', 9, '50000000'),
		).toBeNull();
	});
});
