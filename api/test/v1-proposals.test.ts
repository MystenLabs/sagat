// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	buildAdd,
	buildEnable,
	PersonalMessages,
	SagatApiError,
	verifyProposalCreated,
} from '@mysten/sagat';
import {
	SagatResponseError,
	SagatV1Client,
	type Proposal,
} from '@mysten/sagat/v1';
import { bcs } from '@mysten/sui/bcs';
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
import { eq } from 'drizzle-orm';

import { db } from '../src/db';
import { SchemaProposals } from '../src/db/schema';
import { ApiAuthError, CommonErrors } from '../src/errors';
import { mirroredAliasSet } from '../src/services/signers.service';
import {
	ApiTestFramework,
	buildTransfer,
	errorOf,
	executeProposal,
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
	execute,
	expectSuccess,
	multisigSigner,
	run,
} from './setup/localnet-transactions';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import { gasCoins } from './setup/signer-changes';
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
			digest: created.digest,
			accountAddress: multisig.address,
			accountName: 'Treasury',
			network: 'localnet',
			kind: 'transaction',
			status: 'PENDING',
			ready: false,
			transactionBytes: created.transactionBytes,
			proposerAddress: users[0].address,
			description: 'Pay rent',
			createdAt: expect.any(String),
			signatures: [
				{
					publicKey: users[0].publicKey,
					signature: expect.any(String),
				},
			],
			signerSets: [
				{
					address: multisig.address,
					threshold: 2,
					currentWeight: 1,
					members: multisig.members.map((member) => ({
						publicKey: member.publicKey,
						weight: member.weight,
						order: member.order,
					})),
					acting: true,
					original: true,
				},
			],
			events: {
				created: expect.any(Object),
				proposer: null,
				cancelled: null,
			},
			executedVia: null,
			signerSetsStale: false,
			signerChange: null,
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
		original = false,
	) => ({
		address: multisig.address,
		threshold: multisig.threshold,
		currentWeight,
		members: multisig.members.map((member) => ({
			publicKey: member.publicKey,
			weight: member.weight,
			order: member.order,
		})),
		acting: true,
		original,
	});

	// The original set once it no longer acts: listed, counted as nothing.
	const removedOriginal = (
		multisig: Parameters<typeof setOf>[0],
	) => ({
		...setOf(multisig, 0, true),
		acting: false,
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
			[setOf(account, 1, true), setOf(composition, 1)].sort(
				byAddress,
			),
		);
		expect(before.ready).toBe(false);

		const voted = await session.voteOnProposal(
			k3,
			created.digest,
			created.transactionBytes,
		);
		expect(voted.ready).toBe(true);

		const after = await client.getProposalByDigest(
			created.digest,
		);
		expect(after.signerSets).toEqual(
			[setOf(account, 1, true), setOf(composition, 2)].sort(
				byAddress,
			),
		);
		expect(after.ready).toBe(true);
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
		expect(before.signerSets).toEqual([
			setOf(account, 1, true),
		]);
		expect(before.ready).toBe(false);

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
			message: new ApiAuthError('NotAnAccountSigner')
				.message,
		});

		const after = await client.getProposalByDigest(
			created.digest,
		);
		expect(after.signerSets).toEqual([
			setOf(account, 1, true),
		]);
		expect(after.ready).toBe(false);
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
			setOf(account, 1, true),
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
			removedOriginal(account),
		]);
		expect(proposal.ready).toBe(false);
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

		expect(
			proposal.signerSets.filter((set) => set.acting),
		).toEqual([]);
		expect(proposal.signerSets).toEqual([
			removedOriginal(account),
		]);
		expect(proposal.ready).toBe(false);
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
			setOf(account, 1, true),
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
				.ready,
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
				removedOriginal(account),
			]);
			expect(proposal.ready).toBe(false);
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

	test('create answers 201 with the proposal and refuses an account address that is not canonical, and the list returns only the account’s proposals on that network', async () => {
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

	const notASigner = {
		status: 403,
		body: {
			error: new ApiAuthError('NotAnAccountSigner').message,
		},
	};
	const create = async (
		accountAddress: string,
		bytes: string,
		signature: string,
	) =>
		errorOf(
			await session.post('/v1/proposals?network=localnet', {
				accountAddress,
				transactionBytes: bytes,
				signature,
			}),
		);

	test('create refuses a signature that does not verify alike for a signer, an outsider and an address that is no account', async () => {
		const { k1, address } = await createAccount();
		const outsider = newUser();
		const transactionBytes = await buildTransfer(address);
		const otherBytes = await buildTransfer(address, {
			amount: 2_000_000,
		});
		const noAccount = newUser().address;
		await sendCoins(noAccount, 1);
		const noAccountBytes = await buildTransfer(noAccount);

		const answers = [
			await create(
				address,
				transactionBytes,
				await signedBy(k1, otherBytes),
			),
			await create(
				address,
				transactionBytes,
				await signedBy(outsider, otherBytes),
			),
			await create(
				noAccount,
				noAccountBytes,
				await signedBy(k1, otherBytes),
			),
		];

		expect(answers).toEqual(
			Array(3).fill({
				status: 400,
				body: {
					error: CommonErrors.InvalidTransactionSignature,
				},
			}),
		);
		expect(
			await create(
				address,
				transactionBytes,
				await signedBy(outsider, transactionBytes),
			),
		).toEqual(notASigner);
	});

	test('create answers 400 for bytes that cannot be read or built', async () => {
		const { address } = await createAccount();
		const outsider = newUser();
		const transactionBytes = await buildTransfer(address);
		// Parses and is fully resolved, but its command uses an input that does not exist.
		const data = bcs.TransactionData.parse(
			fromBase64(transactionBytes),
		);
		data.V1!.kind.ProgrammableTransaction!.commands = [
			{
				$kind: 'TransferObjects',
				TransferObjects: {
					objects: [{ $kind: 'Input', Input: 5 }],
					address: { $kind: 'Input', Input: 6 },
				},
			},
		];
		const unbuildable =
			bcs.TransactionData.serialize(data).toBase64();
		for (const bytes of ['AAAA', unbuildable])
			expect(
				await create(
					address,
					bytes,
					await signedBy(outsider, transactionBytes),
				),
			).toEqual({
				status: 400,
				body: { error: 'The transaction cannot be read.' },
			});
	});

	test('vote refuses a signature that does not verify alike for a signer and an outsider', async () => {
		const { k1, k2, address } = await createAccount();
		const outsider = newUser();
		const created = await session.createProposal(
			k1,
			address,
			'localnet',
			await buildTransfer(address),
		);
		const otherBytes = await buildTransfer(address, {
			amount: 2_000_000,
		});
		const vote = async (signature: string) =>
			errorOf(
				await session.post(
					`/v1/proposals/${created.digest}/vote`,
					{ signature },
				),
			);

		const answers = [
			await vote(await signedBy(k2, otherBytes)),
			await vote(await signedBy(outsider, otherBytes)),
		];

		expect(answers).toEqual(
			Array(2).fill({
				status: 400,
				body: {
					error: CommonErrors.InvalidTransactionSignature,
				},
			}),
		);
		expect(
			await vote(
				await signedBy(outsider, created.transactionBytes),
			),
		).toEqual(notASigner);
	});

	test('cancel refuses a signature that does not verify alike for a signer and an outsider', async () => {
		const { k1, address } = await createAccount();
		const outsider = newUser();
		const created = await session.createProposal(
			k1,
			address,
			'localnet',
			await buildTransfer(address),
		);
		const cancel = async (signature: string) =>
			errorOf(
				await session.post(
					`/v1/proposals/${created.digest}/cancel`,
					{ signature },
				),
			);

		const answers = [
			await cancel(await sign(k1, 'another message')),
			await cancel(await sign(outsider, 'another message')),
		];

		expect(answers).toEqual(
			Array(2).fill({
				status: 400,
				body: { error: CommonErrors.InvalidSignature },
			}),
		);
		expect(
			await cancel(
				await sign(
					outsider,
					PersonalMessages.cancelProposal(
						created.digest,
						address,
					),
				),
			),
		).toEqual(notASigner);
	});

	test('an external proposer’s alias proposal is created as an alias call, and removing the proposer cancels it', async () => {
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

		const legacyBytes = toBase64(
			await build(address, (tx) =>
				buildAdd(tx, {
					account: address,
					alias: newUser().address,
				}),
			),
		);
		const legacy = await session.client.createProposal({
			multisigAddress: address,
			network: 'localnet',
			transactionBytes: legacyBytes,
			signature: await signedBy(proposer, legacyBytes),
		});
		expect(legacy.proposerAddress).toBe(proposer.address);
		// One at a time, so the proposer cancels it, as nobody has signed.
		await session.cancelProposal(proposer, {
			digest: legacy.digest,
			accountAddress: address,
		});

		const created = await session.createProposal(
			proposer,
			address,
			'localnet',
			bytes,
		);
		expect(created.kind).toBe('alias_call');
		await session.removeProposer(
			k1,
			proposer.address,
			address,
		);
		expect(
			(await client.getProposalByDigest(created.digest))
				.status,
		).toBe('CANCELLED');
	});

	// Executes the proposal with `signature`, or the API's signatures of `setAddress`, then verifies it.
	const executeVia = async (
		proposal: Proposal,
		setAddress: string,
		signature?: string,
	) => {
		if (signature)
			expectSuccess(
				await execute(
					fromBase64(proposal.transactionBytes),
					signature,
				),
			);
		else
			await executeProposal(
				proposal,
				proposal.signerSets.find(
					(s) => s.address === setAddress,
				)!,
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
		const transfers = await Promise.all(
			(await gasCoins(address, 3)).map((gasCoin) =>
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
			// The API does not count the key, which signs on its own.
			const verified =
				voter === key
					? await executeVia(
							created,
							setAddress,
							await signedBy(key, created.transactionBytes),
						)
					: await executeVia(
							await session.voteOnProposal(
								voter,
								created.digest,
								created.transactionBytes,
							),
							setAddress,
						);
			expect(verified.status).toBe('SUCCESS');
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
		expect(created.ready).toBe(false);

		const unseen = {
			publicKey: k2.publicKey,
			signature: await signedBy(
				k2,
				created.transactionBytes,
			),
		};
		await executeProposal(
			{
				transactionBytes: created.transactionBytes,
				signatures: [...created.signatures, unseen],
			},
			created.signerSets[0],
		);
		const verified = await client.verifyProposalByDigest(
			created.digest,
		);

		expect(verified.status).toBe('SUCCESS');
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
		expect(verified.status).toBe('SUCCESS');
		expect(
			verified.signerSets.map((s) => s.address),
		).toEqual(expected);
		expect(
			await mirroredAliasSet(db, address, 'localnet'),
		).toEqual(expected);
	});

	// An add of a new alias, proposed by `k1` and signed by `k2`, then cancelled by `k1`.
	const cancelledAliasProposal = async ({
		k1,
		k2,
		address,
		signer,
	}: Awaited<ReturnType<typeof createAccount>>) => {
		expectSuccess(await run(address, signer, buildEnable));
		const alias = newUser().address;
		const created = await session.createProposal(
			k1,
			address,
			'localnet',
			toBase64(
				await build(address, (tx) =>
					buildAdd(tx, { account: address, alias }),
				),
			),
		);
		const voted = await session.voteOnProposal(
			k2,
			created.digest,
			created.transactionBytes,
		);
		await session.cancelProposal(k1, created);
		return { alias, voted };
	};

	test('a cancelled alias proposal that executed takes its on-chain outcome', async () => {
		const account = await createAccount();
		const { alias, voted } =
			await cancelledAliasProposal(account);
		await executeProposal(voted, voted.signerSets[0]);

		const verified = await client.verifyProposalByDigest(
			voted.digest,
		);

		expect(verified.status).toBe('SUCCESS');
		expect(verified.executedVia).toBe(account.address);
		expect(
			await mirroredAliasSet(
				db,
				account.address,
				'localnet',
			),
		).toEqual([account.address, alias].sort());
	});

	test('a cancelled alias proposal that is not on chain stays cancelled', async () => {
		const account = await createAccount();
		const { voted } = await cancelledAliasProposal(account);

		const verified = await client.verifyProposalByDigest(
			voted.digest,
		);

		expect(verified.status).toBe('CANCELLED');
		expect(verified.executedVia).toBeNull();
		expect(verified.events.cancelled).toMatchObject({
			action: 'proposal.cancelled',
			actor: account.k1.address,
			subject: voted.digest,
		});
	});
});
