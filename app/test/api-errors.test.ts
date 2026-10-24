// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SagatApiError } from '@mysten/sagat';
import { describe, expect, test } from 'vitest';

import { shownApiError } from '../src/lib/api-errors';

const FALLBACK = 'Something went wrong.';

describe('shownApiError', () => {
	test.each([400, 409, 422])(
		'a %i shows the API’s message',
		(status) => {
			expect(
				shownApiError(
					new SagatApiError('Refused.', status),
					FALLBACK,
				),
			).toBe('Refused.');
		},
	);

	test('a 500 shows the fallback', () => {
		expect(
			shownApiError(
				new SagatApiError('Internal server error', 500),
				FALLBACK,
			),
		).toBe(FALLBACK);
	});

	test('a plain Error shows the fallback', () => {
		expect(
			shownApiError(new Error('Failed to fetch'), FALLBACK),
		).toBe(FALLBACK);
	});
});
