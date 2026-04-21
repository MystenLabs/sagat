// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Parse a human-entered amount (e.g. "1.5") into the on-chain integer
 * representation (bigint) for the given decimals. Returns `null` for
 * inputs that aren't valid positive numbers, so callers can surface a
 * field-level error.
 *
 * Inverse of `formatBalance`.
 */
export function parseAmount(
	input: string,
	decimals: number,
): bigint | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	// Reject anything that's not a non-negative decimal number.
	if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

	const [wholePart, fractionPart = ''] = trimmed.split('.');
	if (fractionPart.length > decimals) return null;

	const paddedFraction = fractionPart
		.padEnd(decimals, '0')
		.slice(0, decimals);

	try {
		const whole = BigInt(wholePart);
		const fraction = paddedFraction
			? BigInt(paddedFraction)
			: 0n;
		return whole * 10n ** BigInt(decimals) + fraction;
	} catch {
		return null;
	}
}

/**
 * Convert an on-chain integer balance string to a human-readable decimal
 * string. Uses BigInt arithmetic to avoid precision loss on large values
 * (e.g. SUI amounts above 2^53).
 */
export function formatBalance(
	rawBalance: string,
	decimals: number,
): string {
	let big: bigint;
	try {
		big = BigInt(rawBalance);
	} catch {
		return rawBalance;
	}

	if (decimals === 0) {
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

	const display = fractionStr
		? `${wholeStr}.${fractionStr}`
		: wholeStr;

	return negative ? `-${display}` : display;
}
