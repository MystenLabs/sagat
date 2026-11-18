// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type z } from 'zod';

import { SagatApiError, type Fetch } from '../client.js';
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

export interface SagatV1ClientOptions {
	fetch?: Fetch;
	/**
	 * Abort a request that hasn't answered after this many milliseconds.
	 * The call then rejects with a `TimeoutError` DOMException.
	 * @default 20000
	 */
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

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
	getProposal(digest: string) {
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
		const body: unknown = await response
			.json()
			.catch(() => undefined);

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
