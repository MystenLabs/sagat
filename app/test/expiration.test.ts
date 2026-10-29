// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { toBase58 } from '@mysten/sui/utils';
import { describe, expect, test } from 'vitest';

import {
	expiresSoon,
	formatTimeLeft,
	getExpiry,
} from '../src/lib/expiration';
import { transfer } from './transactions';

describe('getExpiry', () => {
	// Epoch 10 started at time 1000, and epochs last 100.
	const now = {
		epoch: '10',
		epochStartTimestampMs: '1000',
		epochDurationMs: '100',
	};
	const window = {
		minEpoch: '10',
		maxEpoch: '11',
		minTimestamp: null,
		maxTimestamp: null,
		chain: toBase58(new Uint8Array(32)),
		nonce: 0,
	};

	test('a transaction without an expiration never expires', async () => {
		expect(getExpiry(await transfer(), now)).toBeNull();
		expect(
			getExpiry(await transfer({ None: true }), now),
		).toBeNull();
	});

	test('an epoch expiration ends with that epoch', async () => {
		expect(
			getExpiry(await transfer({ Epoch: 10 }), now),
		).toEqual({
			lastEpoch: 10n,
			expired: false,
			endsAt: new Date(1100),
		});
	});

	test('a validity window ends with its last epoch', async () => {
		const expiry = {
			lastEpoch: 11n,
			expired: false,
			endsAt: new Date(1200),
		};
		expect(
			getExpiry(
				await transfer({ ValidDuring: window }),
				now,
			),
		).toEqual(expiry);
		expect(
			getExpiry(
				await transfer({
					Validity: { ...window, allowedProposers: null },
				}),
				now,
			),
		).toEqual(expiry);
	});

	test('a transaction whose last epoch is over has expired', async () => {
		expect(
			getExpiry(await transfer({ Epoch: 9 }), now)?.expired,
		).toBe(true);
	});

	test('one that expires too far in the future to be a date never does', async () => {
		const oneDay = {
			...now,
			epochDurationMs: String(24 * 60 * 60 * 1000),
		};
		expect(
			getExpiry(
				await transfer({ Epoch: 200_000_000 }),
				oneDay,
			),
		).toBeNull();
	});
});

describe('formatTimeLeft', () => {
	const minute = 60_000;
	const hour = 60 * minute;

	test.each([
		[-minute, 'less than a minute'],
		[30_000, 'less than a minute'],
		[12 * minute, '12m'],
		[5 * hour + 12 * minute, '5h 12m'],
		[51 * hour, '2d 3h'],
	])('%i ms left is %s', (left, text) => {
		expect(
			formatTimeLeft(new Date(left), new Date(0)),
		).toBe(text);
	});
});

describe('expiresSoon', () => {
	const minute = 60_000;

	test.each([
		[59 * minute, true],
		[60 * minute, false],
		[61 * minute, false],
	])('%i ms left is soon: %s', (left, soon) => {
		expect(expiresSoon(new Date(left), new Date(0))).toBe(
			soon,
		);
	});
});
