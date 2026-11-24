// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	SagatApiError,
	verifyProposalCreated,
} from '@mysten/sagat';
import {
	SagatResponseError,
	SagatV1Client,
} from '@mysten/sagat/v1';
import { fromBase64, toBase58 } from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '../src/db';
import { SchemaProposals } from '../src/db/schema';
import { voteOnProposal } from '../src/services/proposals.service';
import {
	ApiTestFramework,
	newUser,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import { register, setAliases } from './setup/acting-sets';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

describe('GET /v1/proposals/:digest', () => {
	let framework: ApiTestFramework;
	let session: TestSession;
	let client: SagatV1Client;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
		session = framework.createSession();
		client = session.v1;
	});

	const proposeRent = async () => {
		const users = [newUser(), newUser()];
		for (const user of users)
			await session.connectUser(user);
		const multisig = await session.createMultisig(
			users,
			2,
			{
				name: 'Treasury',
				fund: true,
			},
		);
		await session.acceptMultisig(
			users[1],
			multisig.address,
		);
		const created = await session.proposeTransfer(
			users[0],
			multisig.address,
			'Pay rent',
		);
		return { users, multisig, created };
	};

	test('returns the proposal under the account names, with its signer sets', async () => {
		const { users, multisig, created } =
			await proposeRent();

		const proposal = await client.getProposalByDigest(
			created.digest,
		);

		expect(proposal).toEqual({
			id: created.id,
			digest: created.digest,
			accountAddress: multisig.address,
			accountName: 'Treasury',
			network: 'localnet',
			status: ProposalStatus.PENDING,
			transactionBytes: created.transactionBytes,
			proposerAddress: users[0].address,
			description: 'Pay rent',
			createdAt: expect.any(String),
			signatures: [
				{
					proposalId: created.id,
					publicKey: users[0].publicKey,
					signature: expect.any(String),
				},
			],
			hasReachedThreshold: false,
			signerSets: [
				{
					address: multisig.address,
					threshold: 2,
					currentWeight: 1,
					hasReachedThreshold: false,
					members: multisig.members.map((member) => ({
						publicKey: member.publicKey,
						weight: member.weight,
						order: member.order,
					})),
				},
			],
			events: {
				created: expect.any(Object),
				proposer: null,
			},
		});
	});

	test("returns a member's proposal with its created event, which the SDK verifier accepts", async () => {
		const { users, created } = await proposeRent();

		const { events, ...proposal } =
			await client.getProposalByDigest(created.digest);

		expect(events.proposer).toBeNull();
		expect(events.created).toEqual({
			id: expect.any(Number),
			action: 'proposal.created',
			actor: users[0].address,
			subject: created.digest,
			proof: expect.any(Object),
			createdAt: expect.any(String),
		});
		const result = await verifyProposalCreated(
			events.created,
			{
				digest: proposal.digest,
				multisigAddress: proposal.accountAddress,
				proposerAddress: proposal.proposerAddress,
				transactionBytes: proposal.transactionBytes,
			},
		);
		expect(result.status).toBe('verified');
	});

	test('a well-formed digest with no proposal is a 404', async () => {
		const error = await client
			.getProposalByDigest(
				toBase58(new Uint8Array(32).fill(7)),
			)
			.catch((e) => e);

		expect(error).toBeInstanceOf(SagatApiError);
		expect(error.status).toBe(404);
		expect(error.message).toBe(
			'The requested resource was not found.',
		);
	});

	test('a malformed digest is refused with a 400', async () => {
		const response = await session.request(
			'/v1/proposals/not-a-digest',
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error:
				'digest: The transaction digest provided is invalid.',
		});
	});

	test('a response that does not match its schema is a 500 and is not sent', async () => {
		const { created } = await proposeRent();
		const corrupted = 'not-a-sui-address';
		await db
			.update(SchemaProposals)
			.set({ proposerAddress: corrupted })
			.where(eq(SchemaProposals.id, created.id));

		const response = await session.request(
			`/v1/proposals/${created.digest}`,
		);
		const text = await response.text();

		expect(response.status).toBe(500);
		expect(JSON.parse(text)).toEqual({
			error: 'Internal Server Error',
		});
		expect(text).not.toContain(corrupted);
	});

	test('the client rejects a 2xx body that does not match the schema', async () => {
		const { created } = await proposeRent();
		// The legacy route answers with the same proposal in its older shape.
		const legacy = new SagatV1Client('', {
			fetch: (url, init) =>
				session.request(
					(url as string).replace(
						'/v1/proposals/',
						'/proposals/digest/',
					),
					init,
				),
		});

		const error = await legacy
			.getProposalByDigest(created.digest)
			.catch((e) => e);

		expect(error).toBeInstanceOf(SagatResponseError);
		expect(
			error.issues.map(
				(issue: { path: PropertyKey[] }) => issue.path,
			),
		).toContainEqual(['accountAddress']);
	});
});

describe('GET /v1/proposals/:digest counts per acting set', () => {
	let session: TestSession;
	let client: SagatV1Client;

	beforeEach(async () => {
		session = new ApiTestFramework(
			await createTestApp(),
		).createSession();
		client = session.v1;
	});

	// Account `A`: original set 2 of 2, `k1` proposed.
	const proposeFromA = async () => {
		const [k1, k2] = [newUser(), newUser()];
		for (const user of [k1, k2])
			await session.connectUser(user);
		const account = await session.createMultisig(
			[k1, k2],
			2,
			{ name: 'Treasury', fund: true },
		);
		await session.acceptMultisig(k2, account.address);
		const created = await session.proposeTransfer(
			k1,
			account.address,
		);
		return { k1, k2, account, created };
	};

	// A signature by a key outside the original set; no `/v1` vote route yet.
	const signAsActing = async (
		user: TestUser,
		created: { id: number; transactionBytes: string },
	) =>
		voteOnProposal({
			proposalId: created.id,
			signature: (
				await user.keypair.signTransaction(
					fromBase64(created.transactionBytes),
				)
			).signature,
			scopeKind: 'acting',
		});

	const setOf = (
		multisig: {
			address: string;
			threshold: number;
			members: {
				publicKey: string;
				weight: number;
				order: number;
			}[];
		},
		currentWeight: number,
	) => ({
		address: multisig.address,
		threshold: multisig.threshold,
		currentWeight,
		hasReachedThreshold:
			currentWeight >= multisig.threshold,
		members: multisig.members.map((member) => ({
			publicKey: member.publicKey,
			weight: member.weight,
			order: member.order,
		})),
	});

	const byAddress = (
		a: { address: string },
		b: { address: string },
	) => (a.address < b.address ? -1 : 1);

	test('a key in two acting sets counts in both, and the proposal is ready when either set reaches its threshold', async () => {
		const { k1, account, created } = await proposeFromA();
		const k3 = newUser();
		const composition = await session.createMultisig(
			[k1, k3],
			2,
		);
		await setAliases(account.address, 'localnet', [
			account.address,
			composition.address,
		]);

		const before = await client.getProposalByDigest(
			created.digest,
		);
		expect(before.signerSets).toEqual(
			[setOf(account, 1), setOf(composition, 1)].sort(
				byAddress,
			),
		);
		expect(before.hasReachedThreshold).toBe(false);

		await signAsActing(k3, created);

		const after = await client.getProposalByDigest(
			created.digest,
		);
		expect(after.signerSets).toEqual(
			[setOf(account, 1), setOf(composition, 2)].sort(
				byAddress,
			),
		);
		expect(after.hasReachedThreshold).toBe(true);
	});

	test('an alias nobody can identify, a registered key’s own address included, is not a signer set', async () => {
		const { account, created } = await proposeFromA();
		const key = newUser();
		await register(key);
		await setAliases(account.address, 'localnet', [
			account.address,
			key.address,
			newUser().address,
		]);

		const proposal = await client.getProposalByDigest(
			created.digest,
		);

		expect(proposal.signerSets).toEqual([
			setOf(account, 1),
		]);
	});

	test('the original set, once removed, is not counted', async () => {
		const { account, created } = await proposeFromA();
		const composition = await session.createMultisig(
			[newUser(), newUser()],
			2,
		);
		await setAliases(account.address, 'localnet', [
			composition.address,
		]);

		const proposal = await client.getProposalByDigest(
			created.digest,
		);

		expect(proposal.signatures).toHaveLength(1);
		expect(proposal.signerSets).toEqual([
			setOf(composition, 0),
		]);
		expect(proposal.hasReachedThreshold).toBe(false);
		expect(proposal.accountName).toBe('Treasury');
	});

	test('an account with no acting set returns an empty list', async () => {
		const { account, created } = await proposeFromA();
		await setAliases(account.address, 'localnet', [
			newUser().address,
		]);

		const proposal = await client.getProposalByDigest(
			created.digest,
		);

		expect(proposal.signerSets).toEqual([]);
		expect(proposal.hasReachedThreshold).toBe(false);
	});

	test('alias rows on another network leave the original set acting', async () => {
		const { account, created } = await proposeFromA();
		const composition = await session.createMultisig(
			[newUser(), newUser()],
			2,
		);
		await setAliases(account.address, 'testnet', [
			composition.address,
		]);

		const proposal = await client.getProposalByDigest(
			created.digest,
		);

		expect(proposal.signerSets).toEqual([
			setOf(account, 1),
		]);
	});
});
