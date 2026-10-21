// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import createClient, { type Client } from 'openapi-fetch';

import { type paths } from './generated/v1.js';
import {
	type Address,
	type AuthCheckResponse,
	type AuthResponse,
} from './types.js';

export type Fetch = (request: Request) => Promise<Response>;

export interface ApiClientOptions {
	/** Origin of the API, without a trailing slash. */
	apiUrl: string;
	/**
	 * A script token from `POST /auth/script-connect`. Without it the
	 * client relies on the session cookie set by `connect()`.
	 */
	token?: string;
	/** Replaces the global `fetch`, for tests and custom transports. */
	fetch?: Fetch;
}

/** An error response from the API, with its status and message. */
export class ApiError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

export class ApiClient {
	readonly #api: Client<paths>;
	readonly #apiUrl: string;
	readonly #headers: Record<string, string>;
	readonly #fetch: Fetch;

	constructor({
		apiUrl,
		token,
		fetch,
		...rest
	}: ApiClientOptions) {
		this.#apiUrl = apiUrl;
		this.#fetch =
			fetch ?? ((request) => globalThis.fetch(request));
		this.#headers = token
			? { Authorization: `Bearer ${token}` }
			: {};
		this.#api = createClient<paths>({
			baseUrl: apiUrl,
			headers: this.#headers,
			credentials: token ? undefined : 'include',
			fetch: this.#fetch,
			...rest,
		});
	}

	// Auth: shared with the legacy API, so typed by hand.

	/** Starts a session for the key that signed the connect message. */
	connect(signature: string, expiry: string) {
		return this.#auth<AuthResponse>('/auth/connect', {
			signature,
			expiry,
		});
	}

	disconnect() {
		return this.#auth<AuthResponse>('/auth/disconnect');
	}

	/** Whether the session is valid, and the addresses it holds. */
	checkAuth() {
		return this.#auth<AuthCheckResponse>('/auth/check');
	}

	// Addresses

	/** The public key registered for an address. */
	async getAddressInfo(address: string): Promise<Address> {
		return this.#unwrap(
			await this.#api.GET('/v1/addresses/{address}', {
				params: { path: { address } },
			}),
		);
	}

	// Turns openapi-fetch's result into the data, or an `ApiError`.
	#unwrap<T>({
		data,
		error,
		response,
	}: {
		data?: T;
		error?: unknown;
		response: Response;
	}): T {
		if (data !== undefined) return data;
		throw new ApiError(
			response.status,
			errorMessage(error, response),
		);
	}

	async #auth<T>(path: string, body?: unknown): Promise<T> {
		const response = await this.#fetch(
			new Request(`${this.#apiUrl}${path}`, {
				method: body === undefined ? 'GET' : 'POST',
				headers: {
					'Content-Type': 'application/json',
					...this.#headers,
				},
				body:
					body === undefined
						? undefined
						: JSON.stringify(body),
				credentials:
					'Authorization' in this.#headers
						? undefined
						: 'include',
			}),
		);
		if (!response.ok) {
			let error: unknown;
			try {
				error = await response.clone().json();
			} catch {
				error = await response.text();
			}
			throw new ApiError(
				response.status,
				errorMessage(error, response),
			);
		}
		return response.json();
	}
}

// The `error` of an error body, else the text or the status.
function errorMessage(error: unknown, response: Response) {
	if (
		typeof error === 'object' &&
		error !== null &&
		'error' in error &&
		typeof error.error === 'string'
	)
		return error.error;
	if (typeof error === 'string' && error) return error;
	return `Request failed with status ${response.status}`;
}
