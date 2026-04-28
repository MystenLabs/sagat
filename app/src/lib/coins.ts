// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	normalizeStructTag,
	SUI_TYPE_ARG,
} from '@mysten/sui/utils';

import type { CoinPricing } from './coinDisplay';

const NORMALIZED_SUI_COIN_TYPE =
	normalizeStructTag(SUI_TYPE_ARG);

export function isSuiCoinType(
	coinType: string | null | undefined,
): boolean {
	if (!coinType) return false;
	try {
		return (
			normalizeStructTag(coinType.trim()) ===
			NORMALIZED_SUI_COIN_TYPE
		);
	} catch {
		return false;
	}
}

export function formatCoinAmount(
	rawBalance: string,
	decimals: number,
): string {
	let big: bigint;
	try {
		big = BigInt(rawBalance);
	} catch {
		return rawBalance;
	}

	if (decimals <= 0) {
		return big.toLocaleString('en-US');
	}

	const negative = big < 0n;
	const abs = negative ? -big : big;
	const base = 10n ** BigInt(decimals);
	const whole = abs / base;
	const fraction = abs % base;

	const wholeStr = whole.toLocaleString('en-US');
	if (fraction === 0n) {
		return negative ? `-${wholeStr}` : wholeStr;
	}

	const fractionStr = fraction
		.toString()
		.padStart(decimals, '0')
		.replace(/0+$/, '');

	const display = `${wholeStr}.${fractionStr}`;
	return negative ? `-${display}` : display;
}

export function formatUsdValue(value: number): string {
	const fractionDigits =
		value !== 0 && Math.abs(value) < 1 ? 4 : 2;
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	}).format(value);
}

/** USD value of a raw on-chain amount, or `null` if any input is missing. */
export function coinUsdValue(
	rawAmount: string | null | undefined,
	pricing: Pick<CoinPricing, 'priceUsd'> & {
		decimals?: number;
	},
): number | null {
	if (rawAmount == null) return null;
	const { priceUsd, decimals } = pricing;
	if (priceUsd == null || decimals == null) return null;

	const amount = rawAmountToFloat(rawAmount, decimals);
	if (amount == null) return null;

	const usd = amount * priceUsd;
	return Number.isFinite(usd) ? usd : null;
}

/** BigInt-safe raw-amount → float, or `null` on unparseable input. */
export function rawAmountToFloat(
	rawAmount: string,
	decimals: number,
): number | null {
	let big: bigint;
	try {
		big = BigInt(rawAmount);
	} catch {
		return null;
	}

	if (decimals <= 0) {
		const n = Number(big);
		return Number.isFinite(n) ? n : null;
	}

	const negative = big < 0n;
	const abs = negative ? -big : big;
	const base = 10n ** BigInt(decimals);
	const whole = Number(abs / base);
	const fraction = Number(abs % base) / Number(base);
	const value = whole + fraction;
	const signed = negative ? -value : value;
	return Number.isFinite(signed) ? signed : null;
}

export interface SortableBalance {
	coinType: string;
	balance: string;
}

/** Sorts balances: SUI first, then USD value desc, then raw balance desc, then coinType. */
export function sortBalances<T extends SortableBalance>(
	balances: readonly T[],
	getUsdValue: (balance: T) => number | null,
): T[] {
	return [...balances].sort((a, b) => {
		const aSui = isSuiCoinType(a.coinType);
		const bSui = isSuiCoinType(b.coinType);
		if (aSui !== bSui) return aSui ? -1 : 1;

		const aUsd = normalizeUsd(getUsdValue(a));
		const bUsd = normalizeUsd(getUsdValue(b));

		if (aUsd != null && bUsd != null) {
			if (aUsd !== bUsd) return bUsd - aUsd;
		} else if (aUsd != null || bUsd != null) {
			return aUsd != null ? -1 : 1;
		}

		try {
			const diff = BigInt(b.balance) - BigInt(a.balance);
			if (diff !== 0n) return diff > 0n ? 1 : -1;
		} catch {
			// fall through
		}

		return a.coinType.localeCompare(b.coinType);
	});
}

function normalizeUsd(value: number | null): number | null {
	return value != null && Number.isFinite(value)
		? value
		: null;
}
