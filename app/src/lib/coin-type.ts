// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	formatAddress,
	normalizeStructTag,
	normalizeSuiAddress,
	parseStructTag,
} from '@mysten/sui/utils';

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

type TypeTag = ReturnType<
	typeof parseStructTag
>['typeParams'][number];

/**
 * A Move type in the asset tables' short form: a system package as `0x2`,
 * any other as `0xdba3…00e7`, and each type parameter by its struct name
 * alone (`0x2::coin::TreasuryCap<PUSD>`). The full type sits beside it in
 * a title or a copy button. Anything that isn't a type comes back as is.
 */
export function formatType(type: string): string {
	try {
		const { address, module, name, typeParams } =
			parseStructTag(type);
		return `${shortPackage(address)}::${module}::${name}${typeParamsLabel(typeParams)}`;
	} catch {
		return type;
	}
}

function shortPackage(address: string): string {
	const system = SYSTEM_PACKAGE_MAP.find(
		([padded]) => padded === address,
	);
	return system ? system[1] : formatAddress(address);
}

function typeParamsLabel(params: TypeTag[]): string {
	if (params.length === 0) return '';
	return `<${params
		.map((param) =>
			typeof param === 'string'
				? param
				: `${param.name}${typeParamsLabel(param.typeParams)}`,
		)
		.join(', ')}>`;
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

/**
 * A coin type in the long form the chain uses (`0x2::sui::SUI` becomes
 * `0x000…0002::sui::SUI`), or '' when it isn't a valid type.
 */
export function normalizeCoinType(
	coinType: string,
): string {
	try {
		return normalizeStructTag(coinType.trim());
	} catch {
		return '';
	}
}
