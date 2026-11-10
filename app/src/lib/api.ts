// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SagatClient } from '@mysten/sagat';

export const API_BASE_URL =
	import.meta.env.VITE_API_URL || 'http://localhost:3000';

const apiFetchFailures = new WeakSet<object>();

/** Whether the error is a request to the API that never got an answer. */
export function isApiFetchFailure(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		apiFetchFailures.has(error)
	);
}

export const apiClient = new SagatClient(
	API_BASE_URL,
	'cookie',
	async (url, init) => {
		try {
			return await fetch(url, init);
		} catch (error) {
			if (typeof error === 'object' && error !== null)
				apiFetchFailures.add(error);
			throw error;
		}
	},
);
