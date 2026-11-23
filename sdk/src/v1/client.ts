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
	AccountDetailsSchema,
	AccountListSchema,
	AccountProposerRemovalSchema,
	ErrorBodySchema,
	InvitationAnswerSchema,
	InvitationListSchema,
	ProposalListSchema,
	ProposalSchema,
	SuccessSchema,
	type AccountProposerRequest,
	type CreateProposalRequest,
	type InvitationAnswerRequest,
	type Network,
	type ProposalStatusName,
	type SignatureRequest,
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

	/** A signer change may carry `labels` for its new keys. */
	createProposal({
		network,
		...body
	}: CreateProposalRequest & { network: Network }) {
		return this.#request(ProposalSchema, '/v1/proposals', {
			method: 'POST',
			query: { network },
			body,
		});
	}

	/** A page of an account's proposals on the network, newest first. */
	getProposals({
		accountAddress,
		network,
		status,
		nextCursor,
		perPage,
	}: {
		accountAddress: string;
		network: Network;
		status?: ProposalStatusName;
		nextCursor?: string;
		perPage?: number;
	}) {
		return this.#request(
			ProposalListSchema,
			'/v1/proposals',
			{
				query: {
					accountAddress,
					network,
					...(status === undefined ? {} : { status }),
					...(nextCursor === undefined
						? {}
						: { nextCursor }),
					...(perPage === undefined
						? {}
						: { perPage: String(perPage) }),
				},
			},
		);
	}

	/** A proposal by its transaction digest. */
	getProposalByDigest(digest: string) {
		return this.#request(
			ProposalSchema,
			`/v1/proposals/${encodeURIComponent(digest)}`,
		);
	}

	/** Adds a signature over the proposal's transaction. */
	voteForProposal(digest: string, body: SignatureRequest) {
		return this.#request(
			ProposalSchema,
			`/v1/proposals/${encodeURIComponent(digest)}/vote`,
			{ method: 'POST', body },
		);
	}

	/** Cancels a proposal, signed with `PersonalMessages.cancelProposal`. */
	cancelProposal(digest: string, body: SignatureRequest) {
		return this.#request(
			ProposalSchema,
			`/v1/proposals/${encodeURIComponent(digest)}/cancel`,
			{ method: 'POST', body },
		);
	}

	/** Records the on-chain outcome of a proposal's transaction. */
	verifyProposalByDigest(digest: string) {
		return this.#request(
			ProposalSchema,
			`/v1/proposals/${encodeURIComponent(digest)}/verify`,
			{ method: 'POST' },
		);
	}

	/** The accounts the caller's keys have accepted on the network, and the ones a key was removed from. */
	getAccounts(network: Network) {
		return this.#request(
			AccountListSchema,
			'/v1/accounts',
			{
				query: { network },
			},
		);
	}

	/** An account, for a key of one of its acting signer sets on the network. */
	getAccount(address: string, network: Network) {
		return this.#request(
			AccountDetailsSchema,
			`/v1/accounts/${encodeURIComponent(address)}`,
			{ query: { network } },
		);
	}

	/** The accounts a caller's key has not answered for, or with `showRejected`, the ones it rejected. */
	getInvitations(
		network: Network,
		{
			showRejected = false,
		}: { showRejected?: boolean } = {},
	) {
		return this.#request(
			InvitationListSchema,
			'/v1/invitations',
			{
				query: showRejected
					? { network, showRejected: 'true' }
					: { network },
			},
		);
	}

	/** Accepts an account, signed with `PersonalMessages.acceptAccountInvitation`. */
	acceptAccountInvite(
		address: string,
		{
			network,
			...body
		}: InvitationAnswerRequest & { network: Network },
	) {
		return this.#request(
			InvitationAnswerSchema,
			`/v1/accounts/${encodeURIComponent(address)}/accept`,
			{ method: 'POST', query: { network }, body },
		);
	}

	/** Rejects an account, signed with `PersonalMessages.rejectAccountInvitation`. */
	rejectAccountInvite(
		address: string,
		{
			network,
			...body
		}: InvitationAnswerRequest & { network: Network },
	) {
		return this.#request(
			InvitationAnswerSchema,
			`/v1/accounts/${encodeURIComponent(address)}/reject`,
			{ method: 'POST', query: { network }, body },
		);
	}

	/** Adds an external proposer, signed with `PersonalMessages.addMultisigProposer`. */
	addAccountProposer(
		address: string,
		{
			network,
			...body
		}: AccountProposerRequest & { network: Network },
	) {
		return this.#request(
			SuccessSchema,
			`/v1/accounts/${encodeURIComponent(address)}/proposers`,
			{ method: 'POST', query: { network }, body },
		);
	}

	/** Removes an external proposer, signed with `PersonalMessages.removeMultisigProposer`, and says what the call did. */
	removeAccountProposer(
		address: string,
		{
			network,
			...body
		}: AccountProposerRequest & { network: Network },
	) {
		return this.#request(
			AccountProposerRemovalSchema,
			`/v1/accounts/${encodeURIComponent(address)}/proposers`,
			{ method: 'DELETE', query: { network }, body },
		);
	}

	async #request<T extends z.ZodType>(
		schema: T,
		endpoint: string,
		{
			method = 'GET',
			query,
			body: requestBody,
		}: {
			method?: 'GET' | 'POST' | 'DELETE';
			query?: Record<string, string>;
			body?: unknown;
		} = {},
	): Promise<z.output<T>> {
		const search = query
			? `?${new URLSearchParams(query)}`
			: '';
		const response = await this.#fetch(
			`${this.#apiUrl}${endpoint}${search}`,
			{
				method,
				signal: AbortSignal.timeout(this.#timeoutMs),
				credentials: 'include',
				...(requestBody === undefined
					? {}
					: {
							headers: {
								'Content-Type': 'application/json',
							},
							body: JSON.stringify(requestBody),
						}),
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
