import {
	ProposalStatus,
	PublicProposal,
	VoteProposalResponse,
	type Address,
	type AuthCheckResponse,
	type AuthResponse,
	type CreateMultisigRequest,
	type CreateProposalRequest,
	type Multisig,
	type MultisigMember,
	type MultisigWithMembers,
	type PaginatedResponse,
	type Proposal,
	type ProposalWithSignatures,
	type SignedMessageRequest,
	type VoteProposalRequest,
} from './types.js';

export type Fetch = (
	url: RequestInfo,
	init?: RequestInit,
) => Promise<Response>;

export class SagatClient {
	#apiUrl: string;
	#mode: 'script' | 'cookie';
	#jwt: string | null = null;
	#fetchOverride: Fetch;

	constructor(
		apiUrl: string,
		mode: 'script' | 'cookie',
		fetchOverride?: Fetch,
	) {
		this.#apiUrl = apiUrl;
		this.#mode = mode;
		this.#fetchOverride =
			fetchOverride || ((url, init) => fetch(url, init));
	}

	async connect(signature: string, expiry: string) {
		const response = await this.#request<AuthResponse>(
			'/auth/connect',
			{
				method: 'POST',
				body: JSON.stringify({ signature, expiry }),
			},
		);

		return response;
	}

	async disconnect() {
		return this.#request<AuthResponse>('/auth/disconnect', {
			method: 'POST',
		});
	}

	/**
	 * Check if the user has a valid cookie (or JWT depending on mode)
	 * and get a list of the connected multisig addresses.
	 * @returns
	 */
	async checkAuth() {
		return this.#request<AuthCheckResponse>('/auth/check');
	}

	async createMultisig(
		data: CreateMultisigRequest,
	): Promise<MultisigWithMembers> {
		const response = await this.#request<{
			multisig: Multisig;
			members: MultisigMember[];
		}>('/multisig', {
			method: 'POST',
			body: JSON.stringify(data),
		});

		// Flatten the response to match MultisigWithMembers interface
		return {
			...response.multisig,
			members: response.members,
			totalMembers: response.members.length,
			totalWeight: response.members.reduce(
				(sum, m) => sum + m.weight,
				0,
			),
			proposers: [], // New multisigs have no proposers yet
		};
	}

	async getMultisig(address: string) {
		return this.#request<MultisigWithMembers>(
			`/multisig/${address}`,
		);
	}

	async acceptMultisigInvite(
		address: string,
		data: SignedMessageRequest,
	) {
		return this.#request<{ success: boolean }>(
			`/multisig/${address}/accept`,
			{
				method: 'POST',
				body: JSON.stringify(data),
			},
		);
	}

	async rejectMultisigInvite(
		address: string,
		data: SignedMessageRequest,
	) {
		return this.#request<{
			message: string;
			address: string;
		}>(`/multisig/${address}/reject`, {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	// Proposal endpoints
	async createProposal(data: CreateProposalRequest) {
		return this.#request<Proposal>('/proposals', {
			method: 'POST',
			body: JSON.stringify(data),
		});
	}

	async getProposals(
		multisigAddress: string,
		network: string,
		params: {
			status?: ProposalStatus;
			nextCursor?: number;
			perPage?: number;
		},
	) {
		const searchParams = new URLSearchParams();
		searchParams.append('multisigAddress', multisigAddress);
		searchParams.append('network', network);

		if (params.nextCursor) {
			searchParams.append(
				'nextCursor',
				params.nextCursor.toString(),
			);
		}
		if (params.perPage) {
			searchParams.append(
				'perPage',
				params.perPage.toString(),
			);
		}

		if (params.status !== undefined) {
			const statusString = ProposalStatus[params.status];
			searchParams.append('status', statusString);
		}

		const query = searchParams.toString();
		return this.#request<
			PaginatedResponse<ProposalWithSignatures>
		>(`/proposals${query ? `?${query}` : ''}`);
	}

	async getProposalByDigest(digest: string) {
		return this.#request<PublicProposal>(
			`/proposals/digest/${encodeURIComponent(digest)}`,
		);
	}

	async voteForProposal(
		proposalId: number,
		data: VoteProposalRequest,
	) {
		return this.#request<VoteProposalResponse>(
			`/proposals/${proposalId}/vote`,
			{
				method: 'POST',
				body: JSON.stringify(data),
			},
		);
	}

	/**
	 * Call this to cancel a proposal.
	 * @param proposalId
	 * @param data Expects a signed `PersonalMessages.cancelProposal()` message.
	 */
	async cancelProposal(
		proposalId: number,
		data: SignedMessageRequest,
	) {
		return this.#request<{ success: boolean }>(
			`/proposals/${proposalId}/cancel`,
			{
				method: 'POST',
				body: JSON.stringify(data),
			},
		);
	}

	/**
	 * Call this to register extra public keys to the system.
	 * Only sui public keys are supported (use `PublicKey.toSuiPublicKey(), not `toBase64()`)
	 */
	async registerPublicKeys(extraPublicKeys: string[] = []) {
		return this.#request<{ success: boolean }>(
			'/addresses',
			{
				method: 'POST',
				body: JSON.stringify({ extraPublicKeys }),
			},
		);
	}

	async registerPublicKey(publicKey: string) {
		return this.registerPublicKeys([publicKey]);
	}

	async getMultisigConnections() {
		return this.#request<
			Record<string, MultisigWithMembers[]>
		>(`/addresses/connections`);
	}

	async getInvitations(
		publicKey: string,
		params?: {
			showRejected?: boolean;
		},
	) {
		const queryParams = new URLSearchParams();
		if (params?.showRejected) {
			queryParams.append('showRejected', 'true');
		}
		const queryParamsString =
			queryParams.size > 0
				? `?${queryParams.toString()}`
				: '';
		return this.#request<MultisigWithMembers[]>(
			`/addresses/invitations/${encodeURIComponent(publicKey)}${queryParamsString}`,
		);
	}

	/**
	 * Call this after a proposal has been executed, to mark it as done
	 * or failed in the system.
	 * That unblocks the pending queue.
	 */
	async verifyProposal(proposalId: number) {
		return this.#request<{ success: boolean }>(
			`/proposals/${proposalId}/verify`,
			{
				method: 'POST',
			},
		);
	}

	async verifyProposalByDigest(digest: string) {
		return this.#request<{ success: boolean }>(
			`/proposals/${encodeURIComponent(digest)}/verify-by-digest`,
			{
				method: 'POST',
			},
		);
	}

	/**
	 * Call this to get the public key for an address registered in the system.
	 */
	async getAddressInfo(address: string) {
		return this.#request<Address>(`/addresses/${address}`);
	}

	/**
	 * Register all public keys that have connected via `connect()` to the system.
	 * This is required before creating or accepting multisigs.
	 */
	async registerAddresses() {
		return this.#request<{ success: boolean }>(
			'/addresses',
			{
				method: 'POST',
			},
		);
	}

	/**
	 * Add a proposer to a multisig.
	 * @param address The multisig address
	 * @param proposer The proposer address to add
	 * @param signature Signed `PersonalMessages.addMultisigProposer()` message
	 * @param expiry The expiry timestamp used in the message
	 */
	async addMultisigProposer(
		address: string,
		proposer: string,
		signature: string,
		expiry: string,
	) {
		return this.#request<{ success: boolean }>(
			`/multisig/${address}/add-proposer`,
			{
				method: 'POST',
				body: JSON.stringify({
					proposer,
					signature,
					expiry,
				}),
			},
		);
	}

	/**
	 * Remove a proposer from a multisig.
	 * @param address The multisig address
	 * @param proposer The proposer address to remove
	 * @param signature Signed `PersonalMessages.removeMultisigProposer()` message
	 * @param expiry The expiry timestamp used in the message
	 */
	async removeMultisigProposer(
		address: string,
		proposer: string,
		signature: string,
		expiry: string,
	) {
		return this.#request<{ success: boolean }>(
			`/multisig/${address}/remove-proposer`,
			{
				method: 'POST',
				body: JSON.stringify({
					proposer,
					signature,
					expiry,
				}),
			},
		);
	}

	async #request<T>(
		endpoint: string,
		options: RequestInit = {},
	): Promise<T> {
		const response = await this.#fetchOverride(
			`${this.#apiUrl}${endpoint}`,
			{
				...options,
				headers: {
					'Content-Type': 'application/json',
					...options.headers,
					...(this.#mode === 'script' && !this.#jwt
						? { Authorization: `Bearer ${this.#jwt}` }
						: {}),
				},
				credentials:
					this.#mode === 'cookie' ? 'include' : undefined,
			},
		);

		if (!response.ok) {
			let errorMessage = `Request failed with status ${response.status}`;
			try {
				const errorData = await response.clone().json();
				if (errorData.error) {
					errorMessage = errorData.error;
				}
			} catch {
				try {
					const errorData = await response.text();
					if (errorData) errorMessage = errorData;
				} catch {}
			}
			throw new Error(errorMessage);
		}

		return response.json();
	}
}
