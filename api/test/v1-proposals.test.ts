// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	SagatApiError,
	SagatResponseError,
	SagatV1Client,
	verifyProposalCreated,
} from '@mysten/sagat';
import { toBase58 } from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '../src/db';
import { SchemaProposals } from '../src/db/schema';
import {
	ApiTestFramework,
	newUser,
	type TestSession,
} from './framework/api-test-framework';
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
		client = new SagatV1Client('', {
			fetch: (url, init) =>
				session.request(url as string, init),
		});
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

		const proposal = await client.getProposal(
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
			await client.getProposal(created.digest);

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
			.getProposal(toBase58(new Uint8Array(32).fill(7)))
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
			.getProposal(created.digest)
			.catch((e) => e);

		expect(error).toBeInstanceOf(SagatResponseError);
		expect(
			error.issues.map(
				(issue: { path: PropertyKey[] }) => issue.path,
			),
		).toContainEqual(['accountAddress']);
	});
});
