// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersonalMessages } from '@mysten/sagat-legacy';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import {
	ApiTestFramework,
	errorOf,
	newUser,
	sign,
	type TestUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

describe('Multisig API', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	test('creates a multisig', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(3);

		const multisig = await session.createMultisig(
			users,
			2,
			{
				name: 'My Test Multisig',
			},
		);

		expect(multisig).toMatchObject({
			threshold: 2,
			name: 'My Test Multisig',
			totalMembers: 3,
		});
	});

	test('rejects invalid thresholds', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);

		await expect(
			session.createMultisig(users, 3),
		).rejects.toThrow('Threshold must be less than');
		await expect(
			session.createMultisig(users, 0),
		).rejects.toThrow(
			'Threshold must be greater or equal to 1',
		);
	});

	test('rejects weights outside 1 to 255', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);

		await expect(
			session.createMultisig(users, 1, { weights: [0, 1] }),
		).rejects.toThrow('Weights must be greater than 0');
		await expect(
			session.createMultisig(users, 1, {
				weights: [256, 1],
			}),
		).rejects.toThrow('Weights must be less than 256');
	});

	test('rejects fewer than 2 or more than 10 members', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(1);
		const tooMany = [
			...users,
			...Array.from({ length: 10 }, newUser),
		];

		await expect(
			session.createMultisig(users, 1),
		).rejects.toThrow(
			'Addresses cannot be more than 10 or less than 2',
		);
		await expect(
			session.createMultisig(tooMany, 1),
		).rejects.toThrow(
			'Addresses cannot be more than 10 or less than 2',
		);

		// A body that only claims a length must be refused before anything
		// is sized by it.
		await expect(
			session.client.createMultisig({
				// @ts-expect-error not an array, on purpose
				publicKeys: { length: 4294967295 },
				weights: [],
				threshold: 1,
			}),
		).rejects.toThrow(
			'Addresses cannot be more than 10 or less than 2',
		);
	});

	test('rejects weights that do not match the members', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);

		await expect(
			session.createMultisig(users, 1, { weights: [1] }),
		).rejects.toThrow(
			'Addresses and weights must be the same length',
		);
	});

	test('rejects creating the same multisig twice', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);
		await session.createMultisig(users, 2);

		await expect(
			session.createMultisig(users, 2),
		).rejects.toThrow('Data already exists');
	});

	test('registers the public keys of members who never connected', async () => {
		const session = framework.createSession();
		const alice = newUser();
		const bob = newUser();
		await session.connectUser(alice);

		await session.createMultisig([alice, bob], 2);

		const info = await session.client.getAddressInfo(
			bob.address,
		);
		expect(info.publicKey).toBe(bob.publicKey);
	});

	test('becomes verified once every member accepts', async () => {
		const session = framework.createSession();
		const alice = newUser();
		const bob = newUser();
		await session.connectUser(alice);

		const { address } = await session.createMultisig(
			[alice, bob],
			2,
		);
		expect(
			(await session.client.getMultisig(address))
				.isVerified,
		).toBe(false);

		await session.acceptMultisig(bob, address);
		const details =
			await session.client.getMultisig(address);
		expect(details).toMatchObject({
			address,
			threshold: 2,
			isVerified: true,
			totalMembers: 2,
		});
	});

	test('non-members cannot accept or reject', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);
		const outsider = newUser();
		const { address } = await session.createMultisig(
			users,
			2,
		);

		await expect(
			session.acceptMultisig(outsider, address),
		).rejects.toThrow(
			'You are not a member of this multisig',
		);
		await expect(
			session.rejectMultisig(outsider, address),
		).rejects.toThrow(
			'You are not a member of this multisig',
		);
	});

	test('non-members cannot read a multisig', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);
		const { address } = await session.createMultisig(
			users,
			2,
		);

		const outsider = framework.createSession();
		await outsider.connectUser(newUser());

		const response = await outsider.request(
			`/multisig/${address}`,
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error:
				'Access denied. You are not a member of this multisig.',
		});
	});

	test('an accepted invitation cannot be rejected, nor can a verified multisig', async () => {
		const session = framework.createSession();
		const [creator, early, late] = [
			newUser(),
			newUser(),
			newUser(),
		];
		await session.connectUser(creator);
		const { address } = await session.createMultisig(
			[creator, early, late],
			3,
		);
		await session.acceptMultisig(early, address);

		const reject = async (user: TestUser) =>
			errorOf(
				await session.post(`/multisig/${address}/reject`, {
					signature: await sign(
						user,
						PersonalMessages.rejectMultisigInvitation(
							address,
						),
					),
				}),
			);

		expect(await reject(early)).toEqual({
			status: 400,
			body: { error: 'Cannot reject after accepting' },
		});

		await session.acceptMultisig(late, address);

		// Once verified, that is the error for anyone, member or not.
		expect(await reject(late)).toEqual({
			status: 400,
			body: { error: 'Multisig is already verified' },
		});
		expect(await reject(newUser())).toEqual({
			status: 400,
			body: { error: 'Multisig is already verified' },
		});
	});

	test('an invitation cannot be rejected twice', async () => {
		const session = framework.createSession();
		const [creator, invitee] = [newUser(), newUser()];
		await session.connectUser(creator);
		const { address } = await session.createMultisig(
			[creator, invitee],
			2,
		);
		await session.rejectMultisig(invitee, address);

		expect(
			await errorOf(
				await session.post(`/multisig/${address}/reject`, {
					signature: await sign(
						invitee,
						PersonalMessages.rejectMultisigInvitation(
							address,
						),
					),
				}),
			),
		).toEqual({
			status: 400,
			body: {
				error: 'This invitation has already been rejected',
			},
		});
	});

	test('accept checks membership before the signature, reject the reverse', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);
		const { address } = await session.createMultisig(
			users,
			2,
		);
		const outsider = newUser();
		// Signed, but not the message either route expects.
		const signature = await sign(
			outsider,
			'Something else',
		);

		expect(
			await errorOf(
				await session.post(`/multisig/${address}/accept`, {
					signature,
				}),
			),
		).toEqual({
			status: 400,
			body: {
				error: 'You are not a member of this multisig',
			},
		});
		expect(
			await errorOf(
				await session.post(`/multisig/${address}/reject`, {
					signature,
				}),
			),
		).toEqual({
			status: 400,
			body: { error: 'Invalid signature for message.' },
		});
	});

	test('rejected invitations are only listed when asked for', async () => {
		const session = framework.createSession();
		const creator = newUser();
		const invitee = newUser();
		await session.connectUser(creator);
		const { address } = await session.createMultisig(
			[creator, invitee],
			2,
		);
		await session.connectUser(invitee);

		const invitations = async (showRejected = false) =>
			(
				await session.client.getInvitations(
					invitee.publicKey,
					{ showRejected },
				)
			).map((m) => m.address);

		expect(await invitations()).toEqual([address]);

		await session.rejectMultisig(invitee, address);
		expect(await invitations()).toEqual([]);
		expect(await invitations(true)).toEqual([address]);
	});

	describe('creator', () => {
		test('is the caller, whatever the member order', async () => {
			const session = framework.createSession();
			const creator = newUser();
			const others = [newUser(), newUser()];
			await session.connectUser(creator);
			// The creator lists itself second, so the first member is someone
			// else: the creator must come from the session, not the order.
			const multisig = await session.createMultisig(
				[others[0], creator, others[1]],
				2,
			);
			expect(multisig.members[0].publicKey).toBe(
				others[0].publicKey,
			);
			expect(multisig.draftedBy).toBe(creator.address);
			expect(
				Date.parse(multisig.createdAt ?? ''),
			).not.toBeNaN();

			const fetched = await session.client.getMultisig(
				multisig.address,
			);
			expect(fetched.draftedBy).toBe(creator.address);
			expect(fetched.createdAt).toBe(multisig.createdAt);

			// The invitee sees who invited them.
			await session.connectUser(others[0]);
			const [invitation] =
				await session.client.getInvitations(
					others[0].publicKey,
				);
			expect(invitation.draftedBy).toBe(creator.address);
			expect(invitation.createdAt).toBe(multisig.createdAt);

			// The accept route returns it too.
			const accepted = await session.acceptMultisig(
				others[0],
				multisig.address,
			);
			expect(accepted.draftedBy).toBe(creator.address);
			expect(accepted.createdAt).toBe(multisig.createdAt);

			// And in the connections listing once accepted.
			const connections =
				await session.client.getMultisigConnections();
			const listed = Object.values(connections)
				.flat()
				.find((m) => m.address === multisig.address);
			expect(listed?.draftedBy).toBe(creator.address);
			expect(listed?.createdAt).toBe(multisig.createdAt);
		});

		test('is the caller even when the caller is not a member', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(1);
			const others = [newUser(), newUser()];
			const multisig = await session.createMultisig(
				others,
				2,
			);
			expect(multisig.draftedBy).toBe(users[0].address);
		});

		test('is the caller key in the composition, not the first connected key', async () => {
			const session = framework.createSession();
			const [outsider, member, someone] = [
				newUser(),
				newUser(),
				newUser(),
			];
			await session.connectUser(outsider);
			await session.connectUser(member);
			const multisig = await session.createMultisig(
				[someone, member],
				2,
			);
			expect(multisig.draftedBy).toBe(member.address);
		});
	});

	describe('key labels', () => {
		const labelsOf = (
			members: {
				publicKey: string;
				label: string | null;
			}[],
		) => members.map((m) => m.label);

		test('members have no label unless one was given', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const multisig = await session.createMultisig(
				users,
				2,
			);
			expect(labelsOf(multisig.members)).toEqual([
				null,
				null,
			]);

			const fetched = await session.client.getMultisig(
				multisig.address,
			);
			expect(labelsOf(fetched.members)).toEqual([
				null,
				null,
			]);
		});

		test('labels given at creation are stored per key and shown everywhere members are', async () => {
			const session = framework.createSession();
			const creator = newUser();
			const invitee = newUser();
			await session.connectUser(creator);
			const multisig = await session.createMultisig(
				[creator, invitee],
				2,
				{ labels: ["Alice's Ledger", null] },
			);
			expect(labelsOf(multisig.members)).toEqual([
				"Alice's Ledger",
				null,
			]);

			const fetched = await session.client.getMultisig(
				multisig.address,
			);
			expect(labelsOf(fetched.members)).toEqual([
				"Alice's Ledger",
				null,
			]);

			// The invitee sees the labels in the invitation.
			await session.connectUser(invitee);
			const [invitation] =
				await session.client.getInvitations(
					invitee.publicKey,
				);
			expect(labelsOf(invitation.members)).toEqual([
				"Alice's Ledger",
				null,
			]);

			// And in the connections listing once accepted.
			await session.acceptMultisig(
				invitee,
				multisig.address,
			);
			const connections =
				await session.client.getMultisigConnections();
			const listed = Object.values(connections)
				.flat()
				.find((m) => m.address === multisig.address);
			expect(labelsOf(listed!.members)).toEqual([
				"Alice's Ledger",
				null,
			]);
		});

		test('each label sits on its own key, whatever the order', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(3);
			const reordered = [users[2], users[0], users[1]];
			const multisig = await session.createMultisig(
				reordered,
				2,
				{ labels: ['Third', 'First', null] },
			);
			const byKey = (
				members: {
					publicKey: string;
					label: string | null;
				}[],
			) =>
				Object.fromEntries(
					members.map((m) => [m.publicKey, m.label]),
				);
			const expected = {
				[users[2].publicKey]: 'Third',
				[users[0].publicKey]: 'First',
				[users[1].publicKey]: null,
			};
			expect(byKey(multisig.members)).toEqual(expected);
			expect(
				byKey(
					(
						await session.client.getMultisig(
							multisig.address,
						)
					).members,
				),
			).toEqual(expected);
		});

		test('only a member can label the keys', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(1);
			const others = [newUser(), newUser()];
			// Setting up a multisig for others is allowed, labelling it is not.
			await expect(
				session.createMultisig(others, 2, {
					labels: ['Planted', null],
				}),
			).rejects.toThrow('Only a member of the multisig');
			const unlabelled = await session.createMultisig(
				others,
				2,
				{
					labels: [null, null],
				},
			);
			expect(labelsOf(unlabelled.members)).toEqual([
				null,
				null,
			]);
			// A member among the keys may label them.
			const labelled = await session.createMultisig(
				[users[0], ...others],
				2,
				{ labels: ['Me', 'Alice', null] },
			);
			expect(labelsOf(labelled.members)).toEqual([
				'Me',
				'Alice',
				null,
			]);
		});

		test('labels are trimmed and blank labels mean no label', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const multisig = await session.createMultisig(
				users,
				2,
				{
					labels: ['  Ops key  ', '   '],
				},
			);
			expect(labelsOf(multisig.members)).toEqual([
				'Ops key',
				null,
			]);
		});

		test('labels are per multisig, not per key', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const first = await session.createMultisig(users, 2, {
				labels: ['Treasury signer', null],
			});
			const second = await session.createMultisig(
				users,
				1,
				{
					labels: [null, 'Ops signer'],
				},
			);
			expect(
				labelsOf(
					(await session.client.getMultisig(first.address))
						.members,
				),
			).toEqual(['Treasury signer', null]);
			expect(
				labelsOf(
					(await session.client.getMultisig(second.address))
						.members,
				),
			).toEqual([null, 'Ops signer']);
		});

		test('labels never reach unauthenticated routes', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const multisig = await session.createMultisig(
				users,
				2,
				{
					labels: ["Alice's Ledger", 'Ops key'],
					fund: true,
				},
			);
			await session.acceptMultisig(
				users[1],
				multisig.address,
			);
			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);

			// A client that never connected.
			const anonymous = framework.createSession().client;

			// The public proposal lookup shows the composition, never the labels.
			const byDigest = await anonymous.getProposalByDigest(
				proposal.digest,
			);
			expect(byDigest.multisig.members).toHaveLength(2);
			const serialized = JSON.stringify(byDigest);
			expect(serialized).not.toContain('"label"');
			expect(serialized).not.toContain("Alice's Ledger");
			expect(serialized).not.toContain('Ops key');

			// Member listings need a session.
			await expect(
				anonymous.getMultisig(multisig.address),
			).rejects.toThrow();

			// The same data, authenticated, does carry them.
			expect(
				labelsOf(
					(
						await session.client.getMultisig(
							multisig.address,
						)
					).members,
				),
			).toEqual(["Alice's Ledger", 'Ops key']);
		});

		test('rejects labels that do not line up with the members or are too long', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			await expect(
				session.createMultisig(users, 2, {
					labels: ['Only one'],
				}),
			).rejects.toThrow('one entry per public key');
			await expect(
				session.createMultisig(users, 2, {
					labels: ['x'.repeat(65), null],
				}),
			).rejects.toThrow('at most 64 characters');
			// Exactly 64 is fine, counted in characters, not UTF-16 units.
			const emoji = '\u{1F512}'.repeat(64);
			const atLimit = await session.createMultisig(
				users,
				1,
				{
					labels: ['x'.repeat(64), emoji],
				},
			);
			expect(labelsOf(atLimit.members)).toEqual([
				'x'.repeat(64),
				emoji,
			]);
			// Nothing that can reorder or hide text next to a key.
			for (const bad of [
				'Alice\u202Eevil',
				'zero\u200Bwidth',
				'new\nline',
				'\u200B',
			])
				await expect(
					session.createMultisig(users, 2, {
						labels: [bad, null],
					}),
				).rejects.toThrow(
					'control or formatting characters',
				);
			await expect(
				session.createMultisig(users, 2, {
					// @ts-expect-error a number is not a label
					labels: [1, null],
				}),
			).rejects.toThrow('string or null');
		});
	});

	test('lists the multisigs of the connected members', async () => {
		const { session, multisig } =
			await framework.createVerifiedMultisig(2, 2);

		const connections =
			await session.client.getMultisigConnections();

		expect(
			Object.values(connections)
				.flat()
				.map((m) => m.address),
		).toContain(multisig.address);
	});
});
