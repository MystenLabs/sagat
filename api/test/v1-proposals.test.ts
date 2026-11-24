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
	type Proposal,
} from '@mysten/sagat/v1';
import {
	fromBase64,
	toBase58,
	toBase64,
} from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from 'bun:test';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '../src/db';
import {
	SchemaAccountAliases,
	SchemaProposals,
} from '../src/db/schema';
import { ApiAuthError, CommonErrors } from '../src/errors';
import {
	buildAdd,
	buildEnable,
} from '../src/utils/aliases';
import {
	ApiTestFramework,
	buildTransfer,
	errorOf,
	newUser,
	refusal,
	sendCoins,
	sign,
	signedBy,
	type TestSession,
} from './framework/api-test-framework';
import { register, setAliases } from './setup/acting-sets';
import {
	build,
	combinedSignature,
	execute,
	expectSuccess,
	multisigSigner,
	run,
} from './setup/localnet-transactions';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import { getLocalClient } from './setup/sui-network';
import { insertProposal } from './setup/v1-proposals';

setupSharedTestEnvironment();
setDefaultTimeout(60_000);

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
		const created = await session.createProposal(
			users[0],
			multisig.address,
			'localnet',
			await buildTransfer(multisig.address),
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
			executedVia: null,
			aliasCalls: [],
			signerSetsStale: false,
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
		const created = await session.createProposal(
			k1,
			account.address,
			'localnet',
			await buildTransfer(account.address),
		);
		return { k1, k2, account, created };
	};

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

		const voted = await session.voteOnProposal(
			k3,
			created.digest,
			created.transactionBytes,
		);
		expect(voted.hasReachedThreshold).toBe(true);

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

	test('a single registered key as an alias is no signer set, and its signature is refused', async () => {
		const { account, created } = await proposeFromA();
		const key = newUser();
		await register(key);
		await setAliases(account.address, 'localnet', [
			account.address,
			key.address,
		]);

		const before = await client.getProposalByDigest(
			created.digest,
		);
		expect(before.signerSets).toEqual([setOf(account, 1)]);
		expect(before.hasReachedThreshold).toBe(false);

		expect(
			await refusal(
				session.voteOnProposal(
					key,
					created.digest,
					created.transactionBytes,
				),
			),
		).toEqual({
			status: 403,
			message: new ApiAuthError('NotAMultisigMember')
				.message,
		});

		const after = await client.getProposalByDigest(
			created.digest,
		);
		expect(after.signerSets).toEqual([setOf(account, 1)]);
		expect(after.hasReachedThreshold).toBe(false);
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

	test('an open proposal is counted again against the sets that act after a change', async () => {
		const { k1, k2, account, created } =
			await proposeFromA();
		await session.voteOnProposal(
			k2,
			created.digest,
			created.transactionBytes,
		);
		expect(
			(await client.getProposalByDigest(created.digest))
				.hasReachedThreshold,
		).toBe(true);
		// `k2` stays with a new weight and threshold; `k1` leaves.
		const changed = await session.createMultisig(
			[k2, newUser()],
			3,
			{ weights: [2, 1] },
		);
		await setAliases(account.address, 'localnet', [
			changed.address,
		]);

		const read = await client.getProposalByDigest(
			created.digest,
		);
		const {
			proposals: [listed],
		} = await client.getProposals({
			accountAddress: account.address,
			network: 'localnet',
		});

		for (const proposal of [read, listed]) {
			expect(
				proposal.signatures.map((s) => s.publicKey),
			).toEqual(
				expect.arrayContaining([
					k1.publicKey,
					k2.publicKey,
				]),
			);
			expect(proposal.signatures).toHaveLength(2);
			expect(proposal.signerSets).toEqual([
				setOf(changed, 2),
			]);
			expect(proposal.hasReachedThreshold).toBe(false);
		}
	});
});

describe('/v1 proposal writes, the list and verify on the chain', () => {
	let session: TestSession;
	let client: SagatV1Client;

	beforeEach(async () => {
		session = new ApiTestFramework(
			await createTestApp(),
		).createSession();
		client = session.v1;
	});

	// Account `A`: `k1` and `k2` accepted, 2 of 2, funded.
	const createAccount = async () => {
		const [k1, k2] = [newUser(), newUser()];
		for (const user of [k1, k2])
			await session.connectUser(user);
		const account = await session.createMultisig(
			[k1, k2],
			2,
			{ fund: true },
		);
		await session.acceptMultisig(k2, account.address);
		const signer = multisigSigner(
			'A',
			[k1.keypair, k2.keypair],
			2,
		);
		expect(signer.address).toBe(account.address);
		return { k1, k2, address: account.address, signer };
	};

	test('create answers 201 with the proposal, and the list returns the account’s proposals on that network', async () => {
		const { k1, k2, address } = await createAccount();
		const transactionBytes = await buildTransfer(address);

		const response = await session.post(
			'/v1/proposals?network=localnet',
			{
				accountAddress: address,
				transactionBytes,
				signature: await signedBy(k1, transactionBytes),
			},
		);
		const created = await response.json();

		expect(response.status).toBe(201);
		expect(created).toEqual(
			await client.getProposalByDigest(created.digest),
		);
		const notCanonical = await session.post(
			'/v1/proposals?network=localnet',
			{
				accountAddress: `0x${address.slice(2).toUpperCase()}`,
				transactionBytes,
				signature: await signedBy(k1, transactionBytes),
			},
		);
		expect(await errorOf(notCanonical)).toEqual({
			status: 400,
			body: { error: CommonErrors.InvalidAddress },
		});

		const other = await session.createMultisig([k1, k2], 1);
		await insertProposal(address, 'testnet', k1.address);
		await insertProposal(
			other.address,
			'localnet',
			k1.address,
		);
		const list = await client.getProposals({
			accountAddress: address,
			network: 'localnet',
		});
		expect(list.network).toBe('localnet');
		expect(list.accountAddress).toBe(address);
		expect(list.proposals.map((p) => p.digest)).toEqual([
			created.digest,
		]);
	});

	test('a well-formed digest with no proposal is a 404 and a malformed one a 400 on vote, cancel and verify', async () => {
		const signature = await sign(newUser(), 'any message');
		const refusalsFor = (digest: string) =>
			Promise.all(
				[
					client.voteForProposal(digest, { signature }),
					client.cancelProposal(digest, { signature }),
					client.verifyProposalByDigest(digest),
				].map(refusal),
			);

		expect(
			await refusalsFor(
				toBase58(new Uint8Array(32).fill(7)),
			),
		).toEqual(
			Array(3).fill({
				status: 404,
				message: 'The requested resource was not found.',
			}),
		);
		expect(await refusalsFor('not-a-digest')).toEqual(
			Array(3).fill({
				status: 400,
				message:
					'digest: The transaction digest provided is invalid.',
			}),
		);
	});

	test('an external proposer’s alias proposal is created and reports its calls', async () => {
		const { k1, address, signer } = await createAccount();
		const proposer = newUser();
		await session.addProposer(
			k1,
			proposer.address,
			address,
		);
		expectSuccess(await run(address, signer, buildEnable));
		const alias = newUser().address;
		const bytes = toBase64(
			await build(address, (tx) =>
				buildAdd(tx, { account: address, alias }),
			),
		);

		const created = await session.createProposal(
			proposer,
			address,
			'localnet',
			bytes,
		);
		expect(created.aliasCalls).toEqual([
			{ function: 'add', aliases: [alias] },
		]);
		await session.removeProposer(
			k1,
			proposer.address,
			address,
		);
		expect(
			(await client.getProposalByDigest(created.digest))
				.status,
		).toBe(ProposalStatus.CANCELLED);
	});

	// Executes the proposal with the API's signatures of `setAddress`, then verifies it.
	const executeVia = async (
		proposal: Proposal,
		setAddress: string,
	) => {
		const set = proposal.signerSets.find(
			(s) => s.address === setAddress,
		)!;
		const [key] = set.members;
		const signature =
			set.members.length === 1
				? proposal.signatures.find(
						(s) => s.publicKey === key.publicKey,
					)!.signature
				: combinedSignature(set, proposal.signatures);
		expectSuccess(
			await execute(
				fromBase64(proposal.transactionBytes),
				signature,
			),
		);
		return client.verifyProposalByDigest(proposal.digest);
	};

	test('records the address that signed for the account: the original set, another set, or a single key', async () => {
		const { k1, k2, address, signer } =
			await createAccount();
		const k3 = newUser();
		const other = await session.createMultisig([k1, k3], 2);
		const key = newUser();
		await register(key);
		expectSuccess(await run(address, signer, buildEnable));
		for (const alias of [other.address, key.address])
			expectSuccess(
				await run(address, signer, (tx) =>
					buildAdd(tx, { account: address, alias }),
				),
			);
		await sendCoins(address, 3);
		const { objects: coins } =
			await getLocalClient().listCoins({ owner: address });
		const transfers = await Promise.all(
			coins
				.slice(0, 3)
				.map((gasCoin) =>
					buildTransfer(address, { gasCoin }),
				),
		);

		const executedVia = [];
		for (const [i, [voter, setAddress]] of (
			[
				[k2, address],
				[k3, other.address],
				[key, key.address],
			] as const
		).entries()) {
			const created = await session.createProposal(
				k1,
				address,
				'localnet',
				transfers[i],
			);
			const verified = await executeVia(
				await session.voteOnProposal(
					voter,
					created.digest,
					created.transactionBytes,
				),
				setAddress,
			);
			expect(verified.status).toBe(ProposalStatus.SUCCESS);
			executedVia.push(verified.executedVia);
		}

		expect(executedVia).toEqual([
			address,
			other.address,
			key.address,
		]);
	});

	test('a proposal executed with signatures the API never saw verifies with no threshold check', async () => {
		const { k1, k2, address } = await createAccount();
		const created = await session.createProposal(
			k1,
			address,
			'localnet',
			await buildTransfer(address),
		);
		expect(created.hasReachedThreshold).toBe(false);

		const unseen = {
			publicKey: k2.publicKey,
			signature: await signedBy(
				k2,
				created.transactionBytes,
			),
		};
		expectSuccess(
			await execute(
				fromBase64(created.transactionBytes),
				combinedSignature(created.signerSets[0], [
					...created.signatures,
					unseen,
				]),
			),
		);
		const verified = await client.verifyProposalByDigest(
			created.digest,
		);

		expect(verified.status).toBe(ProposalStatus.SUCCESS);
		expect(verified.executedVia).toBe(address);
		expect(verified.signatures).toHaveLength(1);
	});

	test('an executed alias call refreshes the mirror at verify, while the alias state is still fresh', async () => {
		const { k1, k2, address, signer } =
			await createAccount();
		const other = await session.createMultisig(
			[k1, newUser()],
			2,
		);
		expectSuccess(await run(address, signer, buildEnable));
		const bytes = toBase64(
			await build(address, (tx) =>
				buildAdd(tx, {
					account: address,
					alias: other.address,
				}),
			),
		);
		// The create reads the chain, so the alias state is fresh from here on.
		const created = await session.createProposal(
			k1,
			address,
			'localnet',
			bytes,
		);
		expect(
			created.signerSets.map((s) => s.address),
		).toEqual([address]);

		const verified = await executeVia(
			await session.voteOnProposal(
				k2,
				created.digest,
				created.transactionBytes,
			),
			address,
		);

		const expected = [address, other.address].sort();
		expect(verified.status).toBe(ProposalStatus.SUCCESS);
		expect(
			verified.signerSets.map((s) => s.address),
		).toEqual(expected);
		const rows = await db
			.select({ alias: SchemaAccountAliases.aliasAddress })
			.from(SchemaAccountAliases)
			.where(
				and(
					eq(SchemaAccountAliases.accountAddress, address),
					eq(SchemaAccountAliases.network, 'localnet'),
				),
			)
			.orderBy(asc(SchemaAccountAliases.aliasAddress));
		expect(rows.map((r) => r.alias)).toEqual(expected);
	});
});
