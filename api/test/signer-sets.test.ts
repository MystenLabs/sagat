// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import { AuthErrors } from '../src/errors';
import {
	ApiTestFramework,
	newUser,
	sign,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

describe('Signer sets API', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	test('creates a signer set and its account', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(3);

		const account = await session.createSignerSet(
			users,
			2,
			{
				name: 'My Test Multisig',
			},
		);

		expect(account).toMatchObject({
			name: 'My Test Multisig',
			proposers: [],
			signerSets: [
				{
					address: account.address,
					label: 'My Test Multisig',
					status: 'inviting',
					isVerified: false,
					threshold: 2,
					totalWeight: 3,
				},
			],
		});
		expect(account.signerSets[0].members).toHaveLength(3);
	});

	test('rejects invalid thresholds', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);

		await expect(
			session.createSignerSet(users, 3),
		).rejects.toThrow('Threshold must be less than');
		await expect(
			session.createSignerSet(users, 0),
		).rejects.toThrow(
			'Threshold must be greater or equal to 1',
		);
	});

	test('rejects weights outside 1 to 255', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);

		await expect(
			session.createSignerSet(users, 1, {
				weights: [0, 1],
			}),
		).rejects.toThrow('Weights must be greater than 0');
		await expect(
			session.createSignerSet(users, 1, {
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
			session.createSignerSet(users, 1),
		).rejects.toThrow(
			'Addresses cannot be more than 10 or less than 2',
		);
		await expect(
			session.createSignerSet(tooMany, 1),
		).rejects.toThrow(
			'Addresses cannot be more than 10 or less than 2',
		);

		// A body that only claims a length must be refused before anything
		// is sized by it.
		await expect(
			session.v1.createSignerSet({
				// @ts-expect-error not an array, on purpose
				publicKeys: { length: 4294967295 },
				weights: [],
				threshold: 1,
			}),
		).rejects.toMatchObject({
			status: 400,
			message:
				'publicKeys: Invalid input: expected array, received object',
		});
	});

	test('rejects weights that do not match the members', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);

		await expect(
			session.createSignerSet(users, 1, { weights: [1] }),
		).rejects.toThrow(
			'Addresses and weights must be the same length',
		);
	});

	test('rejects creating the same signer set twice', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);
		await session.createSignerSet(users, 2);

		await expect(
			session.createSignerSet(users, 2),
		).rejects.toThrow('Data already exists');
	});

	test('registers the public keys of members who never connected', async () => {
		const session = framework.createSession();
		const alice = newUser();
		const bob = newUser();
		await session.connectUser(alice);

		await session.createSignerSet([alice, bob], 2);

		const info = await session.v1.getAddressInfo(
			bob.address,
		);
		expect(info.publicKey).toBe(bob.publicKey);
	});

	test('becomes verified once every member accepts', async () => {
		const session = framework.createSession();
		const alice = newUser();
		const bob = newUser();
		await session.connectUser(alice);

		const { address } = await session.createSignerSet(
			[alice, bob],
			2,
		);
		expect(
			await session.v1.getSignerSet(address),
		).toMatchObject({
			isVerified: false,
			status: 'inviting',
		});

		const accepted = await session.acceptSignerSet(
			bob,
			address,
		);
		expect(accepted).toMatchObject({
			address,
			threshold: 2,
			isVerified: true,
			status: 'verified',
		});
		const fetched = await session.v1.getSignerSet(address);
		expect(fetched).toMatchObject(accepted);
		expect(
			(await session.v1.getAccount(address)).signerSets,
		).toEqual([fetched]);
	});

	test('accepting and rejecting need no session, only the signature', async () => {
		const session = framework.createSession();
		const [creator, early, late, outsider] = [
			newUser(),
			newUser(),
			newUser(),
			newUser(),
		];
		await session.connectUser(creator);
		const { address } = await session.createSignerSet(
			[creator, early, late],
			3,
		);

		const anonymous = framework.createSession();
		// The response carries no members, so no key labels.
		const accepted = await anonymous.acceptSignerSet(
			early,
			address,
		);
		expect(accepted).toMatchObject({
			address,
			isVerified: false,
		});
		expect(accepted).not.toHaveProperty('members');
		expect(
			await anonymous.rejectSignerSet(late, address),
		).not.toHaveProperty('members');

		const members = (await session.v1.getSignerSet(address))
			.members;
		expect(
			members.map((m) => [m.isAccepted, m.isRejected]),
		).toEqual([
			[true, false],
			[true, false],
			[false, true],
		]);

		// A wrong signer is still refused.
		await expect(
			anonymous.acceptSignerSet(outsider, address),
		).rejects.toMatchObject({
			status: 400,
			message: 'You are not a member of this multisig',
		});
		await expect(
			anonymous.rejectSignerSet(outsider, address),
		).rejects.toMatchObject({
			status: 400,
			message: 'You are not a member of this multisig',
		});
	});

	test('non-members cannot accept or reject', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);
		const outsider = newUser();
		const { address } = await session.createSignerSet(
			users,
			2,
		);

		await expect(
			session.acceptSignerSet(outsider, address),
		).rejects.toThrow(
			'You are not a member of this multisig',
		);
		await expect(
			session.rejectSignerSet(outsider, address),
		).rejects.toThrow(
			'You are not a member of this multisig',
		);
	});

	test('non-members cannot read a signer set or its account', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);
		const { address } = await session.createSignerSet(
			users,
			2,
		);

		const outsider = framework.createSession();
		await outsider.connectUser(newUser());

		const denied = {
			status: 403,
			message: AuthErrors.AccessDenied,
		};
		await expect(
			outsider.v1.getSignerSet(address),
		).rejects.toMatchObject(denied);
		await expect(
			outsider.v1.getAccount(address),
		).rejects.toMatchObject(denied);
	});

	test('reading needs a session and a well-formed address', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);
		const { address } = await session.createSignerSet(
			users,
			2,
		);

		const anonymous = framework.createSession().v1;
		await expect(
			anonymous.getSignerSet(address),
		).rejects.toMatchObject({
			status: 401,
			message: 'Unauthorized',
		});

		const malformed = {
			status: 400,
			message: 'address: Must be a valid Sui address.',
		};
		await expect(
			session.v1.getSignerSet('0x123'),
		).rejects.toMatchObject(malformed);
		await expect(
			session.v1.getAccount('not-an-address'),
		).rejects.toMatchObject(malformed);
		await expect(
			session.acceptSignerSet(users[1], 'not-an-address'),
		).rejects.toMatchObject(malformed);
	});

	test('an accepted invitation cannot be rejected, nor can a verified signer set', async () => {
		const session = framework.createSession();
		const [creator, early, late] = [
			newUser(),
			newUser(),
			newUser(),
		];
		await session.connectUser(creator);
		const { address } = await session.createSignerSet(
			[creator, early, late],
			3,
		);
		await session.acceptSignerSet(early, address);

		await expect(
			session.rejectSignerSet(early, address),
		).rejects.toMatchObject({
			status: 400,
			message: 'Cannot reject after accepting',
		});

		await session.acceptSignerSet(late, address);

		// Once verified, that is the error for anyone, member or not.
		for (const user of [late, newUser()])
			await expect(
				session.rejectSignerSet(user, address),
			).rejects.toMatchObject({
				status: 400,
				message: 'Multisig is already verified',
			});
	});

	test('an invitation cannot be rejected twice', async () => {
		const session = framework.createSession();
		const [creator, invitee] = [newUser(), newUser()];
		await session.connectUser(creator);
		const { address } = await session.createSignerSet(
			[creator, invitee],
			2,
		);
		await session.rejectSignerSet(invitee, address);
		expect(
			(await session.v1.getSignerSet(address)).members.find(
				(m) => m.publicKey === invitee.publicKey,
			),
		).toMatchObject({
			isAccepted: false,
			isRejected: true,
		});

		await expect(
			session.rejectSignerSet(invitee, address),
		).rejects.toMatchObject({
			status: 400,
			message: 'This invitation has already been rejected',
		});
	});

	test('accept checks membership before the signature, reject the reverse', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(2);
		const { address } = await session.createSignerSet(
			users,
			2,
		);
		const outsider = newUser();
		// Signed, but not the message either route expects.
		const signature = await sign(
			outsider,
			'Something else',
		);

		await expect(
			session.v1.acceptSignerSetInvite(address, {
				signature,
			}),
		).rejects.toMatchObject({
			status: 400,
			message: 'You are not a member of this multisig',
		});
		await expect(
			session.v1.rejectSignerSetInvite(address, {
				signature,
			}),
		).rejects.toMatchObject({
			status: 400,
			message: 'Invalid signature for message.',
		});
	});

	test('rejected invitations are only listed when asked for', async () => {
		const session = framework.createSession();
		const creator = newUser();
		const invitee = newUser();
		await session.connectUser(creator);
		const { address } = await session.createSignerSet(
			[creator, invitee],
			2,
		);
		await session.connectUser(invitee);

		const invitations = async (showRejected = false) =>
			(
				await session.v1.getInvitations(invitee.publicKey, {
					showRejected,
				})
			).map((m) => m.address);

		expect(await invitations()).toEqual([address]);

		await session.rejectSignerSet(invitee, address);
		expect(await invitations()).toEqual([]);
		expect(await invitations(true)).toEqual([address]);
	});

	test('invitations are only listed for a key the session holds', async () => {
		const { session } =
			await framework.createAuthenticatedSession(1);

		await expect(
			session.v1.getInvitations(newUser().publicKey),
		).rejects.toMatchObject({
			status: 400,
			message: 'You are not authorized.',
		});
	});

	describe('creator', () => {
		test('is the caller, whatever the member order', async () => {
			const session = framework.createSession();
			const creator = newUser();
			const others = [newUser(), newUser()];
			await session.connectUser(creator);
			// The creator lists itself second, so the first member is someone
			// else: the creator must come from the session, not the order.
			const account = await session.createSignerSet(
				[others[0], creator, others[1]],
				2,
			);
			const [created] = account.signerSets;
			expect(created.members[0].publicKey).toBe(
				others[0].publicKey,
			);
			expect(created.draftedBy).toBe(creator.address);
			expect(Date.parse(created.createdAt)).not.toBeNaN();

			const fetched = await session.v1.getSignerSet(
				account.address,
			);
			expect(fetched.draftedBy).toBe(creator.address);
			expect(fetched.createdAt).toBe(created.createdAt);

			// The invitee sees who invited them.
			await session.connectUser(others[0]);
			const [invitation] = await session.v1.getInvitations(
				others[0].publicKey,
			);
			expect(invitation.draftedBy).toBe(creator.address);
			expect(invitation.createdAt).toBe(created.createdAt);

			// The accept route returns it too.
			const accepted = await session.acceptSignerSet(
				others[0],
				account.address,
			);
			expect(accepted.draftedBy).toBe(creator.address);
			expect(accepted.createdAt).toBe(created.createdAt);

			// And in the accounts listing once accepted.
			const listed = (await session.v1.getAccounts()).find(
				(a) => a.address === account.address,
			);
			expect(listed?.signerSets[0].draftedBy).toBe(
				creator.address,
			);
			expect(listed?.signerSets[0].createdAt).toBe(
				created.createdAt,
			);
		});

		test('is the caller even when the caller is not a member', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(1);
			const others = [newUser(), newUser()];
			const account = await session.createSignerSet(
				others,
				2,
			);
			expect(account.signerSets[0].draftedBy).toBe(
				users[0].address,
			);
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
			const account = await session.createSignerSet(
				[someone, member],
				2,
			);
			expect(account.signerSets[0].draftedBy).toBe(
				member.address,
			);
		});
	});

	describe('key labels', () => {
		const labelsOf = (
			members: {
				publicKey: string;
				label: string | null;
			}[],
		) => members.map((m) => m.label);

		const membersOf = async (
			session: ReturnType<
				ApiTestFramework['createSession']
			>,
			address: string,
		) => (await session.v1.getSignerSet(address)).members;

		test('members have no label unless one was given', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const account = await session.createSignerSet(
				users,
				2,
			);
			expect(
				labelsOf(account.signerSets[0].members),
			).toEqual([null, null]);
			expect(
				labelsOf(await membersOf(session, account.address)),
			).toEqual([null, null]);
		});

		test('labels given at creation are stored per key and shown everywhere members are', async () => {
			const session = framework.createSession();
			const creator = newUser();
			const invitee = newUser();
			await session.connectUser(creator);
			const account = await session.createSignerSet(
				[creator, invitee],
				2,
				{ labels: ["Alice's Ledger", null] },
			);
			const expected = ["Alice's Ledger", null];
			expect(
				labelsOf(account.signerSets[0].members),
			).toEqual(expected);
			expect(
				labelsOf(await membersOf(session, account.address)),
			).toEqual(expected);
			expect(
				labelsOf(
					(await session.v1.getAccount(account.address))
						.signerSets[0].members,
				),
			).toEqual(expected);

			// The invitee sees the labels in the invitation.
			await session.connectUser(invitee);
			const [invitation] = await session.v1.getInvitations(
				invitee.publicKey,
			);
			expect(labelsOf(invitation.members)).toEqual(
				expected,
			);

			// Not in the accept response, which needs no session.
			expect(
				await session.acceptSignerSet(
					invitee,
					account.address,
				),
			).not.toHaveProperty('members');

			// And in the accounts listing once accepted.
			const listed = (await session.v1.getAccounts()).find(
				(a) => a.address === account.address,
			);
			expect(
				labelsOf(listed!.signerSets[0].members),
			).toEqual(expected);
		});

		test('each label sits on its own key, whatever the order', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(3);
			const reordered = [users[2], users[0], users[1]];
			const account = await session.createSignerSet(
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
			expect(byKey(account.signerSets[0].members)).toEqual(
				expected,
			);
			expect(
				byKey(await membersOf(session, account.address)),
			).toEqual(expected);
		});

		test('only a member can label the keys', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(1);
			const others = [newUser(), newUser()];
			// Setting up a signer set for others is allowed, labelling it is not.
			await expect(
				session.createSignerSet(others, 2, {
					labels: ['Planted', null],
				}),
			).rejects.toThrow('Only a member of the multisig');
			const unlabelled = await session.createSignerSet(
				others,
				2,
				{
					labels: [null, null],
				},
			);
			expect(
				labelsOf(unlabelled.signerSets[0].members),
			).toEqual([null, null]);
			// A member among the keys may label them.
			const labelled = await session.createSignerSet(
				[users[0], ...others],
				2,
				{ labels: ['Me', 'Alice', null] },
			);
			expect(
				labelsOf(labelled.signerSets[0].members),
			).toEqual(['Me', 'Alice', null]);
		});

		test('labels are trimmed and blank labels mean no label', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const account = await session.createSignerSet(
				users,
				2,
				{
					labels: ['  Ops key  ', '   '],
				},
			);
			expect(
				labelsOf(account.signerSets[0].members),
			).toEqual(['Ops key', null]);
		});

		test('labels are per account, not per key', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const first = await session.createSignerSet(
				users,
				2,
				{
					labels: ['Treasury signer', null],
				},
			);
			const second = await session.createSignerSet(
				users,
				1,
				{
					labels: [null, 'Ops signer'],
				},
			);
			expect(
				labelsOf(await membersOf(session, first.address)),
			).toEqual(['Treasury signer', null]);
			expect(
				labelsOf(await membersOf(session, second.address)),
			).toEqual([null, 'Ops signer']);
		});

		test('labels never reach unauthenticated routes', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			const account = await session.createSignerSet(
				users,
				2,
				{
					labels: ["Alice's Ledger", 'Ops key'],
					fund: true,
				},
			);
			await session.acceptSignerSet(
				users[1],
				account.address,
			);
			const proposal = await session.proposeTransfer(
				users[0],
				account.address,
			);

			// A client that never connected.
			const anonymous = framework.createSession();

			// The public proposal lookup shows the composition, never the key
			// labels. The signer set's own label is the account's, not a key's.
			const byDigest =
				await anonymous.v1.getProposalByDigest(
					proposal.digest,
				);
			const [signerSet] = byDigest.signerSets;
			expect(signerSet.members).toHaveLength(2);
			for (const member of signerSet.members)
				expect(Object.keys(member).sort()).toEqual([
					'hasSigned',
					'order',
					'publicKey',
					'weight',
				]);
			const serialized = JSON.stringify(byDigest);
			expect(serialized).not.toContain("Alice's Ledger");
			expect(serialized).not.toContain('Ops key');

			// Member listings need a session.
			await expect(
				anonymous.v1.getSignerSet(account.address),
			).rejects.toMatchObject({ status: 401 });
			await expect(
				anonymous.v1.getAccount(account.address),
			).rejects.toMatchObject({ status: 401 });

			// The same data, authenticated, does carry them.
			expect(
				labelsOf(await membersOf(session, account.address)),
			).toEqual(["Alice's Ledger", 'Ops key']);
		});

		test('rejects labels that do not line up with the members or are too long', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(2);
			await expect(
				session.createSignerSet(users, 2, {
					labels: ['Only one'],
				}),
			).rejects.toThrow('one entry per public key');
			await expect(
				session.createSignerSet(users, 2, {
					labels: ['x'.repeat(65), null],
				}),
			).rejects.toThrow('at most 64 characters');
			// Exactly 64 is fine, counted in characters, not UTF-16 units.
			const emoji = '\u{1F512}'.repeat(64);
			const atLimit = await session.createSignerSet(
				users,
				1,
				{
					labels: ['x'.repeat(64), emoji],
				},
			);
			expect(
				labelsOf(atLimit.signerSets[0].members),
			).toEqual(['x'.repeat(64), emoji]);
			// Nothing that can reorder or hide text next to a key.
			for (const bad of [
				'Alice‮evil',
				'zero​width',
				'new\nline',
				'​',
			])
				await expect(
					session.createSignerSet(users, 2, {
						labels: [bad, null],
					}),
				).rejects.toThrow(
					'control or formatting characters',
				);
			// The body schema refuses anything but strings and nulls.
			await expect(
				session.createSignerSet(users, 2, {
					// @ts-expect-error a number is not a label
					labels: [1, null],
				}),
			).rejects.toMatchObject({
				status: 400,
				message:
					'labels.0: Invalid input: expected string, received number',
			});
		});
	});
});
