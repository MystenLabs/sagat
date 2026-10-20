// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import { getExplorerUrl } from '../src/lib/utils';

describe('getExplorerUrl', () => {
	test('links to suiscan, and not on localnet', () => {
		expect(getExplorerUrl('abc', 'testnet')).toBe(
			'https://suiscan.xyz/testnet/tx/abc',
		);
		expect(getExplorerUrl('abc', 'localnet')).toBeNull();
	});
});
