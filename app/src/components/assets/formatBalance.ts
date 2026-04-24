// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

function formatUnits(
	rawBalance: string,
	decimals: number,
	options?: { useGrouping?: boolean },
): string {
	let big: bigint;
	try {
		big = BigInt(rawBalance);
	} catch {
		return rawBalance;
	}

	const useGrouping = options?.useGrouping ?? true;

	if (decimals === 0) {
		return useGrouping
			? big.toLocaleString('en-US')
			: big.toString();
	}

	const negative = big < 0n;
	const abs = negative ? -big : big;
	const base = 10n ** BigInt(decimals);
	const whole = abs / base;
	const fraction = abs % base;

	const wholeStr = useGrouping
		? whole.toLocaleString('en-US')
		: whole.toString();

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

/**
 * Parse a human-entered amount (e.g. "1.5") into the on-chain integer
 * representation (bigint). Accepts plain decimals as well as the grouped
 * strings we render in the UI (e.g. "1,234.56").
 */
export function parseAmount(
	input: string,
	decimals: number,
): bigint | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	const match = trimmed.match(
		/^(?:(?<whole>\d+|\d{1,3}(?:,\d{3})+))?(?:\.(?<fraction>\d*))?$/,
	);
	if (!match?.groups) return null;

	const wholePart = match.groups.whole ?? '';
	const fractionPart = match.groups.fraction ?? '';
	if (!wholePart && fractionPart === '') return null;
	if (fractionPart.length > decimals) return null;

	const paddedFraction = fractionPart
		.padEnd(decimals, '0')
		.slice(0, decimals);

	try {
		const whole = BigInt(
			wholePart ? wholePart.replace(/,/g, '') : '0',
		);
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
	return formatUnits(rawBalance, decimals, {
		useGrouping: true,
	});
}

/**
 * Convert an on-chain integer balance string to a parser-safe decimal
 * string for editable form fields. Unlike `formatBalance`, this never
 * inserts grouping separators.
 */
export function formatInputAmount(
	rawBalance: string,
	decimals: number,
): string {
	return formatUnits(rawBalance, decimals, {
		useGrouping: false,
	});
}

/**
 * Compute the maximum parser-safe amount that should be prefilled into the
 * transfer form after reserving any required raw-unit buffer (e.g. SUI gas).
 */
export function getMaxInputAmount(
	rawBalance: string,
	decimals: number,
	reservedRawBalance: string = '0',
): string | null {
	try {
		const remaining =
			BigInt(rawBalance) - BigInt(reservedRawBalance);
		if (remaining <= 0n) return null;
		return formatInputAmount(remaining.toString(), decimals);
	} catch {
		return null;
	}
}
