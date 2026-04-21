// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';

import { prettifyType } from '../preview-effects/utils';

/**
 * Render a coin type compactly for display in dense lists.
 *
 * - Collapses well-known system addresses via `prettifyType`
 *   (e.g. `0x000…0002::sui::SUI` -> `0x2::sui::SUI`).
 * - Truncates any remaining 64-char package address using the
 *   same `0x1234…abcd` shortening used everywhere else in the app
 *   (e.g. `0xa1ec…7e29::usdc::USDC`).
 */
export function formatCoinType(coinType: string): string {
	const pretty = prettifyType(coinType);
	const [pkg, ...rest] = pretty.split('::');
	if (!pkg || rest.length === 0) return pretty;
	if (!pkg.startsWith('0x') || pkg.length <= 12)
		return pretty;
	return `${formatAddress(pkg)}::${rest.join('::')}`;
}
