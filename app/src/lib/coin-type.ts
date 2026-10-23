// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { normalizeSuiAddress } from '@mysten/sui/utils';

/** `0x1234...abcdefgh`: this module's own short form, not the SDK's. */
const shortenAddress = (address: string) =>
	`${address.slice(0, 6)}...${address.slice(-8)}`;

const SYSTEM_PACKAGES = [
	'0x1',
	'0x2',
	'0x3',
	'0x5',
] as const;

const SYSTEM_PACKAGE_MAP: [string, string][] =
	SYSTEM_PACKAGES.map((short) => [
		normalizeSuiAddress(short),
		short,
	]);

export function prettifyType(type: string): string {
	for (const [padded, short] of SYSTEM_PACKAGE_MAP) {
		type = type.split(padded).join(short);
	}
	return type;
}

/**
 * Render a coin type compactly for display in dense lists.
 *
 * - Collapses well-known system addresses via `prettifyType`
 *   (e.g. `0x000...0002::sui::SUI` -> `0x2::sui::SUI`).
 * - Truncates any remaining long package address with
 *   `0x1234...abcd` formatting.
 *
 * TODO: Apply shortening recursively for nested generic type args.
 * The current implementation only shortens the outer package segment.
 * A follow-up should parse via `TypeTagSerializer`/`parseStructTag`
 * from `@mysten/sui` and re-render all nested addresses compactly.
 */
export function formatCoinType(coinType: string): string {
	const pretty = prettifyType(coinType);
	const [pkg, ...rest] = pretty.split('::');
	if (!pkg || rest.length === 0) return pretty;
	if (!pkg.startsWith('0x') || pkg.length <= 12)
		return pretty;
	return `${shortenAddress(pkg)}::${rest.join('::')}`;
}
