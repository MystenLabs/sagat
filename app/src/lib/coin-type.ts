// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	formatAddress,
	normalizeStructTag,
	normalizeSuiAddress,
	parseStructTag,
} from '@mysten/sui/utils';

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

type StructTag = ReturnType<typeof parseStructTag>;
type TypeTag = StructTag['typeParams'][number];

/**
 * A Move type in the app's short form: a system package as `0x2`, any
 * other as `0xdba3…00e7`, and type parameters likewise, except that a
 * framework type parameter goes by its struct name alone
 * (`0x2::coin::TreasuryCap<0x5f1c…9a2e::usdc::USDC>`,
 * `0x2::display::Display<Kiosk>`). The full type sits beside it in a
 * title or a copy button. Anything that isn't a type comes back as is.
 */
export function formatType(type: string): string {
	try {
		return formatTag(parseStructTag(type));
	} catch {
		return type;
	}
}

/**
 * A type parameter in `formatType`'s short form: a framework type by its
 * struct name, any other with its package, so that a look-alike reads
 * differently from the real one.
 */
export function formatTypeParam(param: TypeTag): string {
	if (typeof param === 'string') return param;
	return systemPackage(param.address)
		? `${param.name}${typeParamsLabel(param.typeParams)}`
		: formatTag(param);
}

function formatTag({
	address,
	module,
	name,
	typeParams,
}: StructTag): string {
	return `${shortPackage(address)}::${module}::${name}${typeParamsLabel(typeParams)}`;
}

/** A system package's short form (`0x2`), or undefined for any other. */
function systemPackage(
	address: string,
): string | undefined {
	return SYSTEM_PACKAGE_MAP.find(
		([padded]) => padded === address,
	)?.[1];
}

function shortPackage(address: string): string {
	return systemPackage(address) ?? formatAddress(address);
}

function typeParamsLabel(params: TypeTag[]): string {
	if (params.length === 0) return '';
	return `<${params.map(formatTypeParam).join(', ')}>`;
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
