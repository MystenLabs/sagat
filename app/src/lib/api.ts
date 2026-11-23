// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SagatClient, type Fetch } from '@mysten/sagat';
import { SagatV1Client } from '@mysten/sagat/v1';

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

const apiFetch: Fetch = async (url, init) => {
	try {
		return await fetch(url, init);
	} catch (error) {
		if (typeof error === 'object' && error !== null)
			apiFetchFailures.add(error);
		throw error;
	}
};

export const apiClient = new SagatClient(
	API_BASE_URL,
	'cookie',
	apiFetch,
);

/** The `/v1` routes, on the same API and fetch. */
export const apiV1Client = new SagatV1Client(API_BASE_URL, {
	fetch: apiFetch,
});
