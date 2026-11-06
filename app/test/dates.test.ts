// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import {
	formatDate,
	formatDateTime,
	formatShortDate,
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

	test('leave the year out of a short date only when it is this one', () => {
		const year = new Date().getFullYear();
		const parts = {
			month: 'short',
			day: 'numeric',
		} as const;
		const thisYear = new Date(year, 8, 4);
		const lastYear = new Date(year - 1, 8, 4);
		expect(formatShortDate(thisYear)).toBe(
			thisYear.toLocaleDateString(undefined, parts),
		);
		expect(formatShortDate(lastYear)).toBe(
			lastYear.toLocaleDateString(undefined, {
				...parts,
				year: 'numeric',
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
			expect(formatShortDate(value)).toBeNull();
		}
	});
});
