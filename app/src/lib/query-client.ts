// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	MutationCache,
	QueryCache,
	QueryClient,
	type Query,
} from '@tanstack/react-query';

import {
	isExpectedError,
	reportUnexpected,
} from './error-reporting';

declare module '@tanstack/react-query' {
	interface Register {
		mutationMeta: {
			/** Failures that are an answer from this mutation, not reported. */
			expected?: (error: unknown) => boolean;
		};
	}
}

export function createQueryClient(): QueryClient {
	// Polled queries report once per outage, not on every poll.
	const reported = new WeakSet<Query<unknown, unknown>>();
	return new QueryClient({
		queryCache: new QueryCache({
			onError: (error, query) => {
				if (reported.has(query) || isExpectedError(error))
					return;
				reported.add(query);
				reportUnexpected(error, {
					query: String(query.queryKey[0]),
				});
			},
			onSuccess: (_data, query) => {
				reported.delete(query);
			},
		}),
		mutationCache: new MutationCache({
			onError: (
				error,
				_variables,
				_onMutateResult,
				mutation,
			) => {
				if (mutation.meta?.expected?.(error)) return;
				reportUnexpected(error, {
					mutation: String(
						mutation.options.mutationKey?.[0] ?? 'unknown',
					),
				});
			},
		}),
	});
}
