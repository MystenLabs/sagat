// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type z } from 'zod';

import {
	DEFAULT_TIMEOUT_MS,
	SagatApiError,
	type Fetch,
	type SagatClientOptions,
} from '../client.js';
import {
	ErrorBodySchema,
	ProposalSchema,
} from './schemas.js';

/** A 2xx response whose body does not match the route's schema. */
export class SagatResponseError extends Error {
	status: number;
	issues: z.core.$ZodIssue[];

	constructor(status: number, issues: z.core.$ZodIssue[]) {
		super('The API response does not match its schema.');
		this.name = 'SagatResponseError';
		this.status = status;
		this.issues = issues;
	}
}

export interface SagatV1ClientOptions extends SagatClientOptions {
	fetch?: Fetch;
}

export class SagatV1Client {
	#apiUrl: string;
	#fetch: Fetch;
	#timeoutMs: number;

	constructor(
		apiUrl: string,
		options: SagatV1ClientOptions = {},
	) {
		this.#apiUrl = apiUrl;
		this.#fetch =
			options.fetch ?? ((url, init) => fetch(url, init));
		this.#timeoutMs =
			options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	/** A proposal by its transaction digest. */
	getProposalByDigest(digest: string) {
		return this.#request(
			ProposalSchema,
			`/v1/proposals/${encodeURIComponent(digest)}`,
		);
	}

	async #request<T extends z.ZodType>(
		schema: T,
		endpoint: string,
	): Promise<z.output<T>> {
		const response = await this.#fetch(
			`${this.#apiUrl}${endpoint}`,
			{
				signal: AbortSignal.timeout(this.#timeoutMs),
				credentials: 'include',
			},
		);
		// Only a body that is not JSON is tolerated; a failed read rejects.
		const text = await response.text();
		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			body = undefined;
		}

		if (!response.ok) {
			const error = ErrorBodySchema.safeParse(body);
			throw new SagatApiError(
				error.success
					? error.data.error
					: `Request failed with status ${response.status}`,
				response.status,
			);
		}

		const parsed = schema.safeParse(body);
		if (!parsed.success)
			throw new SagatResponseError(
				response.status,
				parsed.error.issues,
			);
		return parsed.data;
	}
}
