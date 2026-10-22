// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import {
	formatDate,
	formatDateTime,
} from '../src/lib/dates';

describe('dates', () => {
	const iso = '2026-09-04T10:42:00.000Z';

	test('format a known time for people', () => {
		expect(formatDate(iso)).toBe(
			new Date(iso).toLocaleDateString(undefined, {
				dateStyle: 'medium',
			}),
		);
		expect(formatDateTime(iso)).toBe(
			new Date(iso).toLocaleString(undefined, {
				dateStyle: 'medium',
				timeStyle: 'short',
			}),
		);
	});

	test('take a Date as well as an ISO string', () => {
		expect(formatDateTime(new Date(iso))).toBe(
			formatDateTime(iso),
		);
		expect(formatDate(new Date(iso))).toBe(formatDate(iso));
	});

	test('are null when unknown or unreadable', () => {
		for (const value of [null, '', 'not-a-date']) {
			expect(formatDate(value)).toBeNull();
			expect(formatDateTime(value)).toBeNull();
		}
	});
});
