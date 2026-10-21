// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import createClient, { type Client } from 'openapi-fetch';

import { type paths } from './generated/v1.js';
import {
	ProposalStatus,
	type Account,
	type Address,
	type AuthCheckResponse,
	type AuthResponse,
	type CreateProposalRequest,
	type CreateSignerSetRequest,
	type PaginatedResponse,
	type Proposal,
	type PublicProposal,
	type SignedMessageRequest,
	type SignerSet,
	type SignerSetInvitation,
	type SignerSetWithMembers,
	type VoteProposalRequest,
	type VoteProposalResponse,
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
		return this.#auth<AuthResponse>(
			'POST',
			'/auth/connect',
			{ signature, expiry },
		);
	}

	disconnect() {
		return this.#auth<AuthResponse>(
			'POST',
			'/auth/disconnect',
		);
	}

	/** Whether the session is valid, and the addresses it holds. */
	checkAuth() {
		return this.#auth<AuthCheckResponse>(
			'GET',
			'/auth/check',
		);
	}

	// Addresses

	/**
	 * Registers the session's keys, so they can be put in a signer set.
	 * Call it after `connect()`.
	 */
	registerAddresses() {
		return this.registerPublicKeys();
	}

	/**
	 * Registers the session's keys and `extraPublicKeys`. Only Sui public
	 * keys are supported (`PublicKey.toSuiPublicKey()`, not `toBase64()`).
	 */
	async registerPublicKeys(extraPublicKeys: string[] = []) {
		return this.#unwrap(
			await this.#api.POST('/v1/addresses', {
				body: { extraPublicKeys },
			}),
		);
	}

	registerPublicKey(publicKey: string) {
		return this.registerPublicKeys([publicKey]);
	}

	/** The public key registered for an address. */
	async getAddressInfo(address: string): Promise<Address> {
		return this.#unwrap(
			await this.#api.GET('/v1/addresses/{address}', {
				params: { path: { address } },
			}),
		);
	}

	// Signer sets

	/**
	 * Creates a signer set and the account with the same address. The
	 * session's keys in the set accept right away.
	 */
	async createSignerSet(
		data: CreateSignerSetRequest,
	): Promise<Account> {
		return this.#unwrap(
			await this.#api.POST('/v1/signer-sets', {
				body: data,
			}),
		);
	}

	/** A signer set with its members, for a member. */
	async getSignerSet(
		address: string,
	): Promise<SignerSetWithMembers> {
		return this.#unwrap(
			await this.#api.GET('/v1/signer-sets/{address}', {
				params: { path: { address } },
			}),
		);
	}

	/**
	 * Accepts an invitation. Needs no session: the signature identifies
	 * the member. Returns the signer set without its members.
	 * @param data Expects a signed
	 *   `PersonalMessages.acceptSignerSetInvitation()` message.
	 */
	async acceptSignerSetInvite(
		address: string,
		data: SignedMessageRequest,
	): Promise<SignerSet> {
		return this.#unwrap(
			await this.#api.POST(
				'/v1/signer-sets/{address}/accept',
				{ params: { path: { address } }, body: data },
			),
		);
	}

	/**
	 * Rejects an invitation. Needs no session: the signature identifies
	 * the member. Returns the signer set without its members.
	 * @param data Expects a signed
	 *   `PersonalMessages.rejectSignerSetInvitation()` message.
	 */
	async rejectSignerSetInvite(
		address: string,
		data: SignedMessageRequest,
	): Promise<SignerSet> {
		return this.#unwrap(
			await this.#api.POST(
				'/v1/signer-sets/{address}/reject',
				{ params: { path: { address } }, body: data },
			),
		);
	}

	/**
	 * The invitations of `publicKey`, one per account and signer set, or
	 * with `showRejected`, the ones it rejected. `publicKey` must be
	 * connected in the session.
	 */
	async getInvitations(
		publicKey: string,
		params?: { showRejected?: boolean },
	): Promise<SignerSetInvitation[]> {
		return this.#unwrap(
			await this.#api.GET(
				'/v1/signer-sets/invitations/{publicKey}',
				{
					params: {
						path: { publicKey },
						query: params?.showRejected
							? { showRejected: 'true' }
							: {},
					},
				},
			),
		);
	}

	// Accounts

	/** An account with its proposers and signer sets, for a member. */
	async getAccount(address: string): Promise<Account> {
		return this.#unwrap(
			await this.#api.GET('/v1/accounts/{address}', {
				params: { path: { address } },
			}),
		);
	}

	/** The accounts the session can sign for, each once. */
	async getAccounts(): Promise<Account[]> {
		return this.#unwrap(
			await this.#api.GET('/v1/accounts'),
		);
	}

	/**
	 * Adds a proposer to an account.
	 * @param address The account address
	 * @param proposer The proposer address to add
	 * @param signature Signed `PersonalMessages.addAccountProposer()` message
	 * @param expiry The expiry timestamp used in the message
	 */
	async addAccountProposer(
		address: string,
		proposer: string,
		signature: string,
		expiry: string,
	) {
		return this.#unwrap(
			await this.#api.POST(
				'/v1/accounts/{address}/proposers',
				{
					params: { path: { address } },
					body: { proposer, signature, expiry },
				},
			),
		);
	}

	/**
	 * Removes a proposer from an account, cancelling its pending
	 * proposals.
	 * @param address The account address
	 * @param proposer The proposer address to remove
	 * @param signature Signed `PersonalMessages.removeAccountProposer()` message
	 * @param expiry The expiry timestamp used in the message
	 */
	async removeAccountProposer(
		address: string,
		proposer: string,
		signature: string,
		expiry: string,
	) {
		return this.#unwrap(
			await this.#api.DELETE(
				'/v1/accounts/{address}/proposers/{proposer}',
				{
					params: { path: { address, proposer } },
					body: { signature, expiry },
				},
			),
		);
	}

	// Proposals

	/** Proposes a transaction, signed by a member or a proposer. */
	async createProposal(
		data: CreateProposalRequest,
	): Promise<Proposal> {
		return this.#unwrap(
			await this.#api.POST('/v1/proposals', { body: data }),
		);
	}

	/**
	 * An account's proposals on a network, newest first, each with its
	 * progress in the signer sets valid on that network.
	 */
	async getProposals(
		accountAddress: string,
		network: string,
		params: {
			status?: ProposalStatus;
			nextCursor?: number;
			perPage?: number;
		} = {},
	): Promise<PaginatedResponse<PublicProposal>> {
		return this.#unwrap(
			await this.#api.GET('/v1/proposals', {
				params: {
					query: {
						accountAddress,
						network,
						status:
							params.status === undefined
								? undefined
								: (ProposalStatus[
										params.status
									] as keyof typeof ProposalStatus),
						nextCursor: params.nextCursor?.toString(),
						perPage: params.perPage,
					},
				},
			}),
		);
	}

	/**
	 * A proposal by digest, with each signer set that can execute it.
	 * Public: no session needed.
	 */
	async getProposalByDigest(
		digest: string,
	): Promise<PublicProposal> {
		return this.#unwrap(
			await this.#api.GET('/v1/proposals/digest/{digest}', {
				params: { path: { digest } },
			}),
		);
	}

	/**
	 * Adds a member's signature over the proposal's transaction.
	 * `readySignerSets` lists the signer sets that can now execute it.
	 */
	async voteForProposal(
		proposalId: number,
		data: VoteProposalRequest,
	): Promise<VoteProposalResponse> {
		return this.#unwrap(
			await this.#api.POST('/v1/proposals/{id}/vote', {
				params: { path: { id: proposalId } },
				body: data,
			}),
		);
	}

	/**
	 * Cancels a proposal.
	 * @param data Expects a signed `PersonalMessages.cancelProposal()` message.
	 */
	async cancelProposal(
		proposalId: number,
		data: SignedMessageRequest,
	) {
		return this.#unwrap(
			await this.#api.POST('/v1/proposals/{id}/cancel', {
				params: { path: { id: proposalId } },
				body: data,
			}),
		);
	}

	/**
	 * Call this after a proposal has been executed, to record whether it
	 * succeeded. That unblocks the pending queue.
	 */
	async verifyProposal(proposalId: number) {
		return this.#unwrap(
			await this.#api.POST('/v1/proposals/{id}/verify', {
				params: { path: { id: proposalId } },
			}),
		);
	}

	/** Like `verifyProposal`, by digest. Public: no session needed. */
	async verifyProposalByDigest(digest: string) {
		return this.#unwrap(
			await this.#api.POST(
				'/v1/proposals/{digest}/verify-by-digest',
				{ params: { path: { digest } } },
			),
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

	async #auth<T>(
		method: 'GET' | 'POST',
		path: string,
		body?: unknown,
	): Promise<T> {
		const response = await this.#fetch(
			new Request(`${this.#apiUrl}${path}`, {
				method,
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
