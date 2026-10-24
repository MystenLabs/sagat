// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	normalizeStructTag,
	SUI_TYPE_ARG,
} from '@mysten/sui/utils';
import { describe, expect, test } from 'vitest';

import type { SuiNetwork } from '../src/contexts/NetworkContext';
import {
	accountAssetsState,
	coinUsdValue,
	formatCoinAmount,
	formatInputAmount,
	formatUsdValue,
	getMaxInputAmount,
	isSuiCoinType,
	parseAmount,
	pricesAvailableOn,
	pricingOnNetwork,
	rawAmountToFloat,
	shownUsdTotal,
	sortBalances,
	totalUsdValue,
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
});

describe('input helpers', () => {
	test('formats input amounts without grouping', () => {
		expect(formatInputAmount('1234567890', 6)).toBe(
			'1234.56789',
		);
	});

	test('computes max amount after reserving raw units', () => {
		expect(
			getMaxInputAmount('200000000', 9, '50000000'),
		).toBe('0.15');
	});

	test('returns null when reservation leaves no spendable amount', () => {
		expect(
			getMaxInputAmount('50000000', 9, '50000000'),
		).toBeNull();
		expect(
			getMaxInputAmount('49999999', 9, '50000000'),
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

describe('totalUsdValue', () => {
	test('sums the priced balances and counts the rest', () => {
		const balances = [
			{ coinType: 'a', usd: 10.5 },
			{ coinType: 'b', usd: null },
			{ coinType: 'c', usd: 2 },
			{ coinType: 'd', usd: Number.NaN },
		];
		expect(
			totalUsdValue(balances, (balance) => balance.usd),
		).toEqual({ total: 12.5, priced: 2, unpriced: 2 });
	});

	test('is zero for no balances', () => {
		expect(totalUsdValue([], () => null)).toEqual({
			total: 0,
			priced: 0,
			unpriced: 0,
		});
	});
});

describe('shownUsdTotal', () => {
	const total = (...usd: (number | null)[]) =>
		shownUsdTotal(
			totalUsdValue(usd, (value) => value),
			true,
		);
	const offMainnet = (...usd: (number | null)[]) =>
		shownUsdTotal(
			totalUsdValue(usd, (value) => value),
			false,
		);

	test('shows the sum when every coin is priced', () => {
		expect(total(10, 2.5)).toBe(12.5);
	});

	test('shows the priced coins when some have no price', () => {
		expect(total(10, null)).toBe(10);
	});

	test('withholds the total when no coin has a price', () => {
		expect(total(null, null)).toBeNull();
	});

	test('is zero without coins', () => {
		expect(total()).toBe(0);
	});

	test('withholds the total of an empty account without prices', () => {
		expect(offMainnet()).toBeNull();
	});

	test('withholds the total of coins without prices', () => {
		expect(offMainnet(null, null)).toBeNull();
	});
});

describe('pricingOnNetwork', () => {
	const pricing = {
		priceUsd: 1.5,
		priceChange24hUsd: 0.05,
		priceChange24hPercentage: 3,
	};

	test('keeps the prices on mainnet', () => {
		expect(pricingOnNetwork('mainnet', pricing)).toEqual(
			pricing,
		);
	});

	test('fills missing mainnet prices with null', () => {
		expect(pricingOnNetwork('mainnet', {})).toEqual({
			priceUsd: null,
			priceChange24hUsd: null,
			priceChange24hPercentage: null,
		});
	});

	test.each<SuiNetwork>(['testnet', 'devnet', 'localnet'])(
		'drops every price on %s',
		(network) => {
			expect(pricingOnNetwork(network, pricing)).toEqual({
				priceUsd: null,
				priceChange24hUsd: null,
				priceChange24hPercentage: null,
			});
		},
	);
});

describe('pricesAvailableOn', () => {
	test('has prices on mainnet only', () => {
		expect(pricesAvailableOn('mainnet')).toBe(true);
		for (const network of [
			'testnet',
			'devnet',
			'localnet',
		] as const) {
			expect(pricesAvailableOn(network)).toBe(false);
		}
	});
});

describe('accountAssetsState', () => {
	const ready = {
		balancesLoading: false,
		balancesError: false,
		hasData: true,
		pagesLeft: false,
		pricesLoading: false,
		pricesError: false,
		pricesAvailable: true,
	};
	const settled = {
		isLoading: false,
		isError: false,
		pricesError: false,
	};
	const loading = { ...settled, isLoading: true };

	test('loads until the first page arrives', () => {
		expect(
			accountAssetsState({
				...ready,
				balancesLoading: true,
				hasData: false,
			}),
		).toEqual(loading);
	});

	test('loads while pages are left', () => {
		expect(
			accountAssetsState({ ...ready, pagesLeft: true }),
		).toEqual(loading);
	});

	test('is ready once every page and the prices are loaded', () => {
		expect(accountAssetsState(ready)).toEqual(settled);
	});

	test('loads while the prices are pending', () => {
		expect(
			accountAssetsState({ ...ready, pricesLoading: true }),
		).toEqual(loading);
	});

	test('does not wait on prices where there are none', () => {
		expect(
			accountAssetsState({
				...ready,
				pricesLoading: true,
				pricesAvailable: false,
			}),
		).toEqual(settled);
	});

	test('fails when the first load fails', () => {
		expect(
			accountAssetsState({
				...ready,
				balancesError: true,
				hasData: false,
			}),
		).toEqual({ ...settled, isError: true });
	});

	test('keeps the cached balances through a failed refetch', () => {
		expect(
			accountAssetsState({ ...ready, balancesError: true }),
		).toEqual(settled);
	});

	test('fails when a later page fails', () => {
		expect(
			accountAssetsState({
				...ready,
				balancesError: true,
				pagesLeft: true,
			}),
		).toEqual({ ...settled, isError: true });
	});

	test('reports a failed registry without loading', () => {
		expect(
			accountAssetsState({ ...ready, pricesError: true }),
		).toEqual({ ...settled, pricesError: true });
	});

	test('ignores a failed registry where there are no prices', () => {
		expect(
			accountAssetsState({
				...ready,
				pricesError: true,
				pricesAvailable: false,
			}),
		).toEqual(settled);
	});
});

// Coins seen on Sui: 0 (NFT-like counts), 6 (USDC), 8 (wrapped BTC),
// 9 (SUI), 18 (bridged ETH-style tokens), and a couple in between.
const COIN_DECIMALS = [0, 1, 2, 6, 8, 9, 18] as const;
/** The largest balance a coin can hold on chain. */
const U64_MAX = 2n ** 64n - 1n;
/** u64 max in whole units, grouped, for each decimals value. */
const U64_MAX_SHOWN: Record<
	(typeof COIN_DECIMALS)[number],
	string
> = {
	0: '18,446,744,073,709,551,615',
	1: '1,844,674,407,370,955,161.5',
	2: '184,467,440,737,095,516.15',
	6: '18,446,744,073,709.551615',
	8: '184,467,440,737.09551615',
	9: '18,446,744,073.709551615',
	18: '18.446744073709551615',
};

describe('parseAmount across coin decimals', () => {
	describe.each(COIN_DECIMALS)(
		'%i decimals',
		(decimals) => {
			const unit = 10n ** BigInt(decimals);

			test('reads whole amounts, with a trailing point, grouping or spaces around', () => {
				expect(parseAmount('1', decimals)).toBe(unit);
				expect(parseAmount('1.', decimals)).toBe(unit);
				expect(parseAmount(' 1 ', decimals)).toBe(unit);
				expect(parseAmount('1,000', decimals)).toBe(
					1000n * unit,
				);
				expect(parseAmount('01,000', decimals)).toBe(
					1000n * unit,
				);
				expect(parseAmount('1,000.', decimals)).toBe(
					1000n * unit,
				);
				expect(parseAmount('0', decimals)).toBe(0n);
			});

			test('reads a 25-digit whole part exactly, past u64 max', () => {
				const whole = '1234567890123456789012345';
				expect(parseAmount(whole, decimals)).toBe(
					BigInt(whole) * unit,
				);
			});

			test('rejects one fractional digit more than the coin has, never rounding', () => {
				expect(
					parseAmount(
						`1.${'1'.repeat(decimals + 1)}`,
						decimals,
					),
				).toBeNull();
				expect(
					parseAmount('1.0000000000000000001', decimals),
				).toBeNull();
			});

			test('rejects signs, exponents, inner spaces and non-ASCII digits', () => {
				for (const input of [
					'+1',
					'-1',
					'1e3',
					'1 000',
					'1_000',
					'0x10',
					'Infinity',
					'١٢',
					'１２',
					'1​',
					'.',
					'1..5',
					'1,',
					',100',
					'1,000,',
				])
					expect(parseAmount(input, decimals)).toBeNull();
			});
		},
	);

	describe.each(COIN_DECIMALS.filter((d) => d > 0))(
		'%i decimals, fractions',
		(decimals) => {
			const unit = 10n ** BigInt(decimals);

			test('reads a half however it is written', () => {
				for (const input of ['.5', '0.5', '00.5'])
					expect(parseAmount(input, decimals)).toBe(
						unit / 2n,
					);
				expect(parseAmount('1,000.5', decimals)).toBe(
					1000n * unit + unit / 2n,
				);
				expect(parseAmount('0.0', decimals)).toBe(0n);
			});

			test('reads exactly as many fractional digits as the coin has', () => {
				expect(
					parseAmount(
						`1.${'1'.repeat(decimals)}`,
						decimals,
					),
				).toBe(BigInt(`1${'1'.repeat(decimals)}`));
				expect(
					parseAmount(
						`0.${'0'.repeat(decimals - 1)}1`,
						decimals,
					),
				).toBe(1n);
			});
		},
	);

	test('a 0-decimal coin takes no fraction at all, not even zeros', () => {
		for (const input of [
			'0.5',
			'.5',
			'1.5',
			'00.5',
			'1.0',
			'0.0',
		])
			expect(parseAmount(input, 0)).toBeNull();
	});

	test('zeros past the coin’s decimals are refused like any other digit', () => {
		expect(parseAmount('1.50', 1)).toBeNull();
		expect(parseAmount('1.000', 2)).toBeNull();
		expect(parseAmount('1.0000000', 6)).toBeNull();
	});

	test('a comma is always grouping: "1,500" is fifteen hundred and "0,5" is refused', () => {
		expect(parseAmount('1,500', 6)).toBe(1_500_000_000n);
		expect(parseAmount('0,5', 6)).toBeNull();
		expect(parseAmount('1,5', 6)).toBeNull();
	});
});

describe('formatting round trips across coin decimals', () => {
	describe.each(COIN_DECIMALS)(
		'%i decimals',
		(decimals) => {
			const unit = 10n ** BigInt(decimals);
			const balances = [
				1n,
				unit,
				unit - 1n,
				U64_MAX,
				U64_MAX + 1n,
			];

			test('the input form parses back to the same raw amount', () => {
				for (const raw of balances)
					expect(
						parseAmount(
							formatInputAmount(raw.toString(), decimals),
							decimals,
						),
					).toBe(raw);
			});

			test('the grouped display form parses back to the same raw amount', () => {
				for (const raw of balances)
					expect(
						parseAmount(
							formatCoinAmount(raw.toString(), decimals),
							decimals,
						),
					).toBe(raw);
			});

			test('shows u64 max to the last raw unit, grouped', () => {
				expect(
					formatCoinAmount(U64_MAX.toString(), decimals),
				).toBe(U64_MAX_SHOWN[decimals]);
				expect(
					formatInputAmount(U64_MAX.toString(), decimals),
				).toBe(U64_MAX_SHOWN[decimals].replace(/,/g, ''));
			});
		},
	);

	test('shows one raw unit with every leading zero', () => {
		expect(formatCoinAmount('1', 0)).toBe('1');
		expect(formatCoinAmount('1', 1)).toBe('0.1');
		expect(formatCoinAmount('1', 8)).toBe('0.00000001');
		expect(formatCoinAmount('999999999999999999', 18)).toBe(
			'0.999999999999999999',
		);
	});
});

describe('USD value of 18-decimal and 0-decimal coins', () => {
	test('u64 max of an 18-decimal coin is within float precision', () => {
		expect(
			rawAmountToFloat(U64_MAX.toString(), 18),
		).toBeCloseTo(18.446744073709551615, 14);
		expect(
			coinUsdValue(U64_MAX.toString(), {
				decimals: 18,
				priceUsd: 3000,
			}),
		).toBeCloseTo(55_340.232221, 5);
	});

	test('a large 18-decimal balance keeps its whole part exact', () => {
		// 1,000,000,000.5 tokens.
		expect(
			rawAmountToFloat('1000000000500000000000000000', 18),
		).toBe(1_000_000_000.5);
	});

	test('just under one token reads as one in floating point', () => {
		expect(rawAmountToFloat('999999999999999999', 18)).toBe(
			1,
		);
	});

	test('one raw unit of an 18-decimal coin shows as $0.0000', () => {
		const usd = coinUsdValue('1', {
			decimals: 18,
			priceUsd: 3000,
		});
		expect(usd).toBeGreaterThan(0);
		expect(formatUsdValue(usd!)).toBe('$0.0000');
	});

	test('a 0-decimal balance past 2^53 loses its last digits', () => {
		expect(
			formatUsdValue(
				coinUsdValue(U64_MAX.toString(), {
					decimals: 0,
					priceUsd: 1,
				})!,
			),
		).toBe('$18,446,744,073,709,552,000.00');
	});
});
