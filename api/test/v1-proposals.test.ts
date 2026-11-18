// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	SagatApiError,
	SagatV1Client,
} from '@mysten/sagat';
import { toBase58 } from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

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

	test('returns the proposal under the account names, with its tally', async () => {
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
			currentWeight: 1,
			hasReachedThreshold: false,
			signerSet: {
				address: multisig.address,
				threshold: 2,
				members: multisig.members.map((member) => ({
					publicKey: member.publicKey,
					weight: member.weight,
					order: member.order,
				})),
			},
		});

		// The client strips unknown keys, so check the wire.
		const raw = await (
			await session.request(
				`/v1/proposals/${created.digest}`,
			)
		).json();
		expect(raw).not.toHaveProperty('events');
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
});
