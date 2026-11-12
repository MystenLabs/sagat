// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { formatLongAddress } from '../src/lib/sui-utils';

describe('formatLongAddress', () => {
	it('keeps 0x and the first and last ten hex characters', () => {
		expect(
			formatLongAddress(
				'0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890fedcba',
			),
		).toBe('0x1234567890…7890fedcba');
	});

	it('leaves an address too short to cut whole', () => {
		expect(formatLongAddress('0x2')).toBe('0x2');
	});
});
