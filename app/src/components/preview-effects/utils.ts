// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export const onChainAmountToFloat = (
	amount: string,
	decimals: number,
) => {
	const total = parseFloat(amount);

	return total / Math.pow(10, decimals);
};

export const formatAddress = (address: string) => {
	return `${address.slice(0, 6)}...${address.slice(-8)}`;
};

import { normalizeSuiAddress } from '@mysten/sui/utils';

const SYSTEM_PACKAGES = ['0x1', '0x2', '0x3', '0x5'] as const;

const SYSTEM_PACKAGE_MAP: [string, string][] = SYSTEM_PACKAGES.map(
	(short) => [normalizeSuiAddress(short), short],
);

export function prettifyType(type: string): string {
	for (const [padded, short] of SYSTEM_PACKAGE_MAP) {
		type = type.split(padded).join(short);
	}
	return type;
}
