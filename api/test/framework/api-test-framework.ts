import {
	defaultExpiry,
	PersonalMessages,
	ProposalStatus,
	SagatClient,
	type MultisigWithMembers,
} from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { MIST_PER_SUI } from '@mysten/sui/utils';
import { Hono } from 'hono';

import {
	fundAddress,
	getLocalClient,
} from '../setup/sui-network';
import {
	createCookieFetch,
	FetchLike,
} from './cookie-fetch';

const client = getLocalClient();
const TEST_PLACEHOLDER_URL = 'http://test-placeholder-url';

export interface TestUser {
	keypair: Ed25519Keypair;
	publicKey: string;
	address: string;
}

export const newUser = (): TestUser => {
	const keypair = new Ed25519Keypair();
	return {
		keypair,
		publicKey: keypair.getPublicKey().toSuiPublicKey(),
		address: keypair.toSuiAddress(),
	};
};

export class TestSession {
	private cookie: string = '';
	private users: TestUser[] = [];
	private cookieFetch: ReturnType<typeof createCookieFetch>;
	private client: SagatClient;

	constructor(private app: Hono) {
		this.cookieFetch = createCookieFetch(
			this.#createFreshAppFetch(),
		);
		this.client = new SagatClient(
			TEST_PLACEHOLDER_URL,
			'cookie',
			this.cookieFetch.fetch,
		);
	}

	createUser() {
		const user = newUser();
		this.users.push(user);
		return user;
	}

	private async signMessage(
		keypair: Ed25519Keypair,
		message: string,
	) {
		const bytes = new TextEncoder().encode(message);
		const { signature } =
			await keypair.signPersonalMessage(bytes);
		return signature;
	}

	async connectUser(user: TestUser) {
		const expiry = defaultExpiry();
		const message = PersonalMessages.connect(expiry);
		const signature = await this.signMessage(
			user.keypair,
			message,
		);

		try {
			const response = await this.client.connect(
				signature,
				expiry,
			);

			if (!response.success) {
				throw new Error(
					`Auth failed for user ${user.address}`,
				);
			}
		} catch (error) {
			throw new Error(
				`Auth failed for user ${user.address}: ${error}`,
			);
		}

		this.cookie =
			this.cookieFetch.jar.getConnectedWalletCookie();

		// Track connected user if not already tracked
		if (
			!this.users.find((u) => u.address === user.address)
		) {
			this.users.push(user);
		}
	}

	async registerAddresses() {
		if (!this.cookie) {
			throw new Error(
				'No users connected - call connectUsers first',
			);
		}

		await this.client.registerAddresses();
	}

	async createMultisig(
		members: TestUser[],
		threshold: number,
		name?: string,
		fund: boolean = false,
	) {
		return this.createCustomMultisig(
			members,
			members.map(() => 1),
			threshold,
			name,
			fund,
		);
	}

	async createCustomMultisig(
		members: TestUser[],
		weights: number[],
		threshold: number,
		name?: string,
		fund: boolean = false,
	) {
		const multisig = await this.client.createMultisig({
			publicKeys: members.map((m) => m.publicKey),
			weights,
			threshold,
			name,
		});

		// Only fund if explicitly requested
		if (fund) await fundAddress(multisig.address);

		return multisig;
	}

	async multiCoinsToAddress(
		keypair: Ed25519Keypair,
		recipient: string,
		count: number,
		totalPerCoin: number = 0.1 * Number(MIST_PER_SUI),
	) {
		await fundAddress(keypair.toSuiAddress());

		const tx = new Transaction();
		tx.setSender(keypair.toSuiAddress());
		for (let i = 0; i < count; i++) {
			tx.moveCall({
				target: '0x2::pay::split_and_transfer',
				arguments: [
					tx.gas,
					tx.pure.u64(totalPerCoin),
					tx.pure.address(recipient),
				],
				typeArguments: ['0x2::sui::SUI'],
			});
		}
		// use the first user's gas to send a few sui to the multisig.
		const result = await keypair.signAndExecuteTransaction({
			transaction: tx,
			client,
		});

		await client.waitForTransaction({
			digest: result.digest,
		});
	}

	async acceptMultisig(
		member: TestUser,
		multisigAddress: string,
	) {
		const message =
			PersonalMessages.acceptMultisigInvitation(
				multisigAddress,
			);
		const signature = await this.signMessage(
			member.keypair,
			message,
		);

		await this.client.acceptMultisigInvite(
			multisigAddress,
			{ signature },
		);
	}

	// Expose app for direct API calls when needed
	getApp(): Hono {
		return this.app;
	}

	async createProposal(
		proposer: TestUser,
		multisigAddress: string,
		network: string,
		transactionBytes: string,
		description?: string,
	) {
		const txBytes = Transaction.from(transactionBytes);
		const builtTx = await txBytes.build({ client });
		const signature =
			await proposer.keypair.signTransaction(builtTx);

		return this.client.createProposal({
			multisigAddress,
			network,
			transactionBytes,
			signature: signature.signature,
			description,
		});
	}

	async getProposals({
		multisigAddress,
		network,
		status,
		cursor,
	}: {
		multisigAddress: string;
		network: string;
		status?: string;
		cursor?: { nextCursor?: number; perPage?: number };
	}) {
		// Convert status string to ProposalStatus enum if provided
		let statusEnum: any = undefined;
		if (status) {
			statusEnum =
				ProposalStatus[
					status as keyof typeof ProposalStatus
				];
		}

		return this.client.getProposals(
			multisigAddress,
			network,
			{
				status: statusEnum,
				nextCursor: cursor?.nextCursor,
				perPage: cursor?.perPage,
			},
		);
	}

	// Simple helper for repetitive test transfers - builds transaction inline for clarity
	async createSimpleTransferProposal(
		proposer: TestUser,
		multisigAddress: string,
		recipient: string,
		amount: number,
		description?: string,
	) {
		const tx = new Transaction();
		tx.setSender(multisigAddress);
		const [coin] = tx.splitCoins(tx.gas, [amount]);
		tx.transferObjects([coin], recipient);

		const txBytes = await tx.build({ client });
		const signature =
			await proposer.keypair.signTransaction(txBytes);

		const proposal = await this.client.createProposal({
			multisigAddress,
			network: 'localnet',
			transactionBytes: txBytes.toBase64(),
			signature: signature.signature,
			description,
		});

		return proposal;
	}

	async voteOnProposal(
		voter: TestUser,
		proposalId: number,
		transactionBytes: string,
	) {
		const txBytes = Transaction.from(transactionBytes);
		const builtTx = await txBytes.build({ client });
		const signature =
			await voter.keypair.signTransaction(builtTx);

		return this.client.voteForProposal(proposalId, {
			signature: signature.signature,
		});
	}

	async disconnect() {
		await this.client.disconnect();
		this.cookie = '';
		this.cookieFetch = createCookieFetch(
			this.#createFreshAppFetch(),
		);
		// Reset client!
		this.client = new SagatClient(
			'http://localhost:3000',
			'cookie',
			this.cookieFetch.fetch,
		);
		this.users = [];
	}

	getConnectedUsers() {
		if (!this.cookieFetch.jar.getConnectedWalletCookie())
			return [];

		try {
			// Extract JWT from cookie
			const jwt =
				this.cookieFetch.jar.getConnectedWalletCookie();
			if (!jwt) return [];

			// Decode JWT payload (it's base64 encoded)
			const parts = jwt.split('.');
			if (parts.length !== 3) return [];

			const payload = JSON.parse(atob(parts[1]));
			const publicKeysFromJWT = payload.publicKeys || [];

			// Map JWT public keys back to our test users
			return this.users.filter((user) =>
				publicKeysFromJWT.includes(user.publicKey),
			);
		} catch (error) {
			console.warn('Failed to decode JWT:', error);
			return [];
		}
	}

	hasActiveCookie(): boolean {
		return (
			!!this.cookieFetch.jar.getConnectedWalletCookie() &&
			this.getConnectedUsers().length > 0
		);
	}

	getStatefulClient(): SagatClient {
		return this.client;
	}

	#createFreshAppFetch(): FetchLike {
		return async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const url =
				typeof input === 'string'
					? input
					: input instanceof URL
						? input.href
						: input.url;

			const path = url.replace(TEST_PLACEHOLDER_URL, '');
			return this.app.request(path, init);
		};
	}
}

export class ApiTestFramework {
	constructor(private app: Hono) {}

	createSession(): TestSession {
		return new TestSession(this.app);
	}

	// Helper methods for common workflows
	async createAuthenticatedSession(
		userCount: number = 2,
	): Promise<{
		session: TestSession;
		users: TestUser[];
	}> {
		const session = this.createSession();
		const users: TestUser[] = [];

		for (let i = 0; i < userCount; i++) {
			users.push(session.createUser());
		}

		for (const user of users)
			await session.connectUser(user);
		await session.registerAddresses();

		return { session, users };
	}

	async createVerifiedMultisig(
		userCount: number = 2,
		threshold?: number,
		name?: string,
		fund: boolean = false,
	): Promise<{
		session: TestSession;
		users: TestUser[];
		multisig: MultisigWithMembers;
	}> {
		const { session, users } =
			await this.createAuthenticatedSession(userCount);
		const actualThreshold = threshold || userCount;

		const multisig = await session.createMultisig(
			users,
			actualThreshold,
			name,
			fund,
		);

		// Accept for all non-creator members
		for (let i = 1; i < users.length; i++) {
			await session.acceptMultisig(
				users[i],
				multisig.address,
			);
		}

		return { session, users, multisig };
	}

	async createFundedVerifiedMultisig(
		userCount: number = 2,
		threshold?: number,
		name?: string,
	): Promise<{
		session: TestSession;
		users: TestUser[];
		multisig: MultisigWithMembers;
	}> {
		return this.createVerifiedMultisig(
			userCount,
			threshold,
			name,
			true,
		);
	}

	async addProposer(
		member: TestUser,
		proposer: string,
		multisigAddress: string,
		customExpiry?: string,
	): Promise<void> {
		const expiry = customExpiry || defaultExpiry();
		const message = PersonalMessages.addMultisigProposer(
			proposer,
			multisigAddress,
			expiry,
		);
		const bytes = new TextEncoder().encode(message);
		const signature =
			await member.keypair.signPersonalMessage(bytes);

		await this.statelessClient().addMultisigProposer(
			multisigAddress,
			proposer,
			signature.signature,
			expiry,
		);
	}

	// Remove proposer for a multisig.
	async removeProposer(
		member: TestUser,
		proposer: string,
		multisigAddress: string,
	): Promise<void> {
		const expiry = defaultExpiry();
		const message = PersonalMessages.removeMultisigProposer(
			proposer,
			multisigAddress,
			expiry,
		);
		const bytes = new TextEncoder().encode(message);
		const signature =
			await member.keypair.signPersonalMessage(bytes);

		await this.statelessClient().removeMultisigProposer(
			multisigAddress,
			proposer,
			signature.signature,
			expiry,
		);
	}

	statelessClient(): SagatClient {
		return new SagatClient(
			TEST_PLACEHOLDER_URL,
			'cookie',
			this.#createFreshAppFetch(),
		);
	}

	// Create a fresh fetch function that uses the app directly, instead of
	// going through the actual API call.
	// Practically, what this does is call `app.request('/route')` internally,
	// instead of calling `http://localhost:3000/route`.
	#createFreshAppFetch(): FetchLike {
		return async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const url =
				typeof input === 'string'
					? input
					: input instanceof URL
						? input.href
						: input.url;

			const path = url.replace(TEST_PLACEHOLDER_URL, '');
			return this.app.request(path, init);
		};
	}
}
