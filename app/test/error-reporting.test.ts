// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SagatApiError } from '@mysten/sagat';
import { RpcError } from '@mysten/sui/grpc';
import * as Sentry from '@sentry/react';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vitest';

import { ErrorBoundary } from '../src/components/ErrorBoundary';
import {
	isExpectedError,
	reportCrash,
} from '../src/lib/error-reporting';
import { createQueryClient } from '../src/lib/query-client';
import {
	SimulationFailedError,
	type SimulatedTransaction,
} from '../src/lib/transaction-preview';
import {
	SignatureDeclinedError,
	SignInCancelledError,
} from '../src/lib/wallet-session';

vi.mock('@sentry/react', () => ({
	init: vi.fn(),
	captureException: vi.fn(),
	captureReactException: vi.fn(),
}));

beforeEach(() => {
	vi.stubEnv(
		'VITE_SENTRY_DSN',
		'https://key@o0.ingest.example.com/1',
	);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe('isExpectedError', () => {
	test('a declined wallet prompt is expected, a wallet failure is not', () => {
		const declined = new Error('Request rejected by user.');
		expect(isExpectedError(declined)).toBe(true);
		expect(
			isExpectedError(new SignatureDeclinedError(declined)),
		).toBe(true);
		expect(
			isExpectedError(
				new SignatureDeclinedError(
					new Error('Ledger device is locked'),
				),
			),
		).toBe(false);
	});

	test('an API 4xx is expected, a 500 is not', () => {
		expect(
			isExpectedError(new SagatApiError('Refused.', 499)),
		).toBe(true);
		expect(
			isExpectedError(new SagatApiError('Broken.', 500)),
		).toBe(false);
	});

	test('an aborted request is expected, a timed-out one is not', () => {
		expect(
			isExpectedError(
				new DOMException('Aborted', 'AbortError'),
			),
		).toBe(true);
		expect(
			isExpectedError(
				new DOMException('Timed out', 'TimeoutError'),
			),
		).toBe(false);
		expect(
			isExpectedError(new SignInCancelledError()),
		).toBe(true);
	});

	test('a failed simulation is expected, an RPC error is not', () => {
		expect(
			isExpectedError(
				new SimulationFailedError(
					'MoveAbort',
					{} as SimulatedTransaction,
				),
			),
		).toBe(true);
		expect(
			isExpectedError(
				new RpcError(
					'Transaction rejected: invalid user signature',
					'INVALID_ARGUMENT',
				),
			),
		).toBe(false);
	});
});

test('a boundary crash is reported once with its component stack', () => {
	const boundary = new ErrorBoundary({
		children: null,
		fallback: () => null,
		onError: (error, info) =>
			reportCrash(error, info, 'page'),
	});
	const error = new Error('render failed');

	boundary.componentDidCatch(error, {
		componentStack: '\n    at Page',
	});
	boundary.componentDidCatch(new Error('second cell'), {
		componentStack: '\n    at Cell',
	});

	expect(
		Sentry.captureReactException,
	).toHaveBeenCalledTimes(1);
	expect(Sentry.captureReactException).toHaveBeenCalledWith(
		error,
		{ componentStack: '\n    at Page' },
		expect.objectContaining({
			tags: { source: 'app', boundary: 'page' },
		}),
	);
});

describe('a failed query', () => {
	test('a 500 is reported once after its retries', async () => {
		const client = createQueryClient();

		await expect(
			client.fetchQuery({
				queryKey: ['multisig', '0x1'],
				queryFn: () =>
					Promise.reject(new SagatApiError('boom', 500)),
				retry: 2,
				retryDelay: 1,
			}),
		).rejects.toThrow('boom');

		expect(Sentry.captureException).toHaveBeenCalledTimes(
			1,
		);
		expect(Sentry.captureException).toHaveBeenCalledWith(
			expect.any(SagatApiError),
			expect.objectContaining({
				tags: {
					source: 'api',
					query: 'multisig',
					status: '500',
				},
			}),
		);
	});

	test('a 404 is not reported', async () => {
		const client = createQueryClient();

		await expect(
			client.fetchQuery({
				queryKey: ['multisig', '0x1'],
				queryFn: () =>
					Promise.reject(new SagatApiError('missing', 404)),
				retry: false,
			}),
		).rejects.toThrow('missing');

		expect(Sentry.captureException).not.toHaveBeenCalled();
	});

	test('a query that stays broken reports once, and again after it recovers', async () => {
		const client = createQueryClient();
		const queryKey = ['multisig', '0x1'];
		const fetch = (queryFn: () => Promise<unknown>) =>
			client.fetchQuery({
				queryKey,
				queryFn,
				retry: false,
				staleTime: 0,
				gcTime: Infinity,
			});
		const fail = () =>
			Promise.reject(new SagatApiError('boom', 500));

		await expect(fetch(fail)).rejects.toThrow('boom');
		const query = client.getQueryCache().find({ queryKey });
		expect(query).toBeDefined();
		await expect(fetch(fail)).rejects.toThrow('boom');
		expect(Sentry.captureException).toHaveBeenCalledTimes(
			1,
		);

		await fetch(() => Promise.resolve('ok'));
		await expect(fetch(fail)).rejects.toThrow('boom');
		expect(Sentry.captureException).toHaveBeenCalledTimes(
			2,
		);
		expect(client.getQueryCache().find({ queryKey })).toBe(
			query,
		);
	});
});
