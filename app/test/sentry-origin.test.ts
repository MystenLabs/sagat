// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import { sentryOrigin } from '../scripts/sentry-origin';

describe('sentryOrigin', () => {
	test('gives the DSN origin without the key, and nothing without a DSN', () => {
		expect(
			sentryOrigin('https://abc@o0.ingest.us.sentry.io/0'),
		).toBe('https://o0.ingest.us.sentry.io');
		expect(sentryOrigin('')).toBe('');
	});

	test('refuses a DSN that is not https', () => {
		expect(() => sentryOrigin('http://abc@host/1')).toThrow(
			'VITE_SENTRY_DSN must be',
		);
	});

	test('refuses a malformed DSN', () => {
		expect(() => sentryOrigin('not a dsn')).toThrow(
			'VITE_SENTRY_DSN must be',
		);
		expect(() =>
			sentryOrigin('https://o0.ingest.us.sentry.io/0'),
		).toThrow('VITE_SENTRY_DSN must be');
		expect(() =>
			sentryOrigin('https://abc@o0.ingest.us.sentry.io/0/'),
		).toThrow('VITE_SENTRY_DSN must be');
	});
});
