// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Drafts and their invitations (docs/account-rotation.md, steps 1 and 2).
// A signer set drafted for an account is visible to its invitees as an
// invitation, never as the account, until it is in an alias set. The draft
// links are written directly, see `framework/rotation.ts`; accepting and
// rejecting go through the `/v1` routes.

import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import { AuthErrors } from '../src/errors';
import {
	ApiTestFramework,
	failureOf,
	newUser,
	type TestUser,
} from './framework/api-test-framework';
import {
	draftSignerSet,
	linkStatus,
	rotationScenario,
	type RotationScenario,
} from './framework/rotation';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

describe('Rotation: drafts and invitations', () => {
	let framework: ApiTestFramework;
	let s: RotationScenario;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
		s = await rotationScenario(framework);
	});

	const invitations = async (
		user: TestUser,
		showRejected = false,
	) =>
		(await s.as(user)).v1.getInvitations(user.publicKey, {
			showRejected,
		});

	// Invitations as `[accountAddress, signer set address, status]`.
	const summary = async (
		user: TestUser,
		showRejected = false,
	) =>
		(await invitations(user, showRejected)).map((i) => [
			i.accountAddress,
			i.address,
			i.status,
		]);

	const accountOf = async (user: TestUser) =>
		(await s.as(user)).v1.getAccount(s.A);

	const accessDenied = {
		status: 403,
		message: AuthErrors.AccessDenied,
	};

	test('an invitee sees the draft as an invitation that names the account', async () => {
		expect(await invitations(s.k5)).toEqual([
			{
				accountAddress: s.A,
				accountName: 'Treasury',
				address: s.S3,
				label: 'Board',
				status: 'draft',
				isVerified: false,
				threshold: 2,
				totalWeight: 2,
				draftedBy: s.k1.address,
				createdAt: expect.any(String),
				validOn: [],
				members: [s.k5, s.k6].map((key, order) => ({
					signerSetAddress: s.S3,
					publicKey: key.publicKey,
					weight: 1,
					order,
					isAccepted: false,
					isRejected: false,
					label: null,
				})),
			},
		]);
	});

	test('an invitee of a draft cannot read the account, and does not see it on the dashboard', async () => {
		expect(await failureOf(accountOf(s.k5))).toEqual(
			accessDenied,
		);
		expect(
			await (await s.as(s.k5)).v1.getAccounts(),
		).toEqual([]);
	});

	test('a draft accepted by everyone is verified, but still valid nowhere and gives no access', async () => {
		await s.creator.acceptSignerSet(s.k5, s.S3);
		expect(await summary(s.k6)).toEqual([
			[s.A, s.S3, 'draft'],
		]);
		const accepted = await s.creator.acceptSignerSet(
			s.k6,
			s.S3,
		);
		expect(accepted).toMatchObject({
			address: s.S3,
			status: 'verified',
			isVerified: true,
			validOn: [],
		});

		expect(await summary(s.k5)).toEqual([]);
		expect(await summary(s.k6)).toEqual([]);
		expect(await failureOf(accountOf(s.k5))).toEqual(
			accessDenied,
		);
		expect(
			await (await s.as(s.k5)).v1.getAccounts(),
		).toEqual([]);

		const s3 = (await accountOf(s.k1)).signerSets.find(
			(x) => x.address === s.S3,
		);
		expect(s3).toMatchObject({
			status: 'verified',
			isVerified: true,
			validOn: [],
		});
	});

	test('a rejection abandons the draft: gone for every invitee, listed as abandoned on the account', async () => {
		const rejected = await s.creator.rejectSignerSet(
			s.k5,
			s.S3,
		);
		expect(rejected).toMatchObject({
			address: s.S3,
			status: 'abandoned',
		});
		expect(await linkStatus(s.A, s.S3)).toBe('abandoned');

		expect(await summary(s.k5)).toEqual([]);
		expect(await summary(s.k6)).toEqual([]);
		// The rejecting key still finds it among its rejections.
		expect(await summary(s.k5, true)).toEqual([
			[s.A, s.S3, 'abandoned'],
		]);
		expect(await summary(s.k6, true)).toEqual([]);

		const s3 = (await accountOf(s.k1)).signerSets.find(
			(x) => x.address === s.S3,
		);
		expect(s3).toMatchObject({
			status: 'abandoned',
			validOn: [],
		});
	});

	test('an abandoned draft is not reopened when the composition is verified later', async () => {
		await s.creator.rejectSignerSet(s.k5, s.S3);
		// Accepting after rejecting is allowed, and verifies the set.
		await s.creator.acceptSignerSet(s.k5, s.S3);
		await s.creator.acceptSignerSet(s.k6, s.S3);
		expect(await linkStatus(s.A, s.S3)).toBe('abandoned');
	});

	test("a rejection of an account's own original set keeps the legacy behaviour", async () => {
		const session = framework.createSession();
		const [creator, invitee] = [newUser(), newUser()];
		await session.connectUser(creator);
		const { address } = await session.createSignerSet(
			[creator, invitee],
			2,
		);

		await session.rejectSignerSet(invitee, address);
		expect(await linkStatus(address, address)).toBe(
			'inviting',
		);
		// The creator still reads its account.
		expect(
			(await session.v1.getAccount(address)).signerSets,
		).toMatchObject([{ status: 'inviting' }]);
	});

	describe('a composition drafted for two accounts', () => {
		let B: string;
		let S4: string;

		beforeEach(async () => {
			// B: another account, with k3 in its original set, and its own
			// label for k3.
			const other = framework.createSession();
			const owner = newUser();
			await other.connectUser(owner);
			await other.connectUser(s.k3);
			B = (
				await other.createSignerSet([owner, s.k3], 1, {
					name: 'Payroll',
					labels: [null, 'k3 in Payroll'],
				})
			).address;

			// S4 = k3, k4, k5, drafted for A and for B.
			S4 = await draftSignerSet(
				s.A,
				[s.k3, s.k4, s.k5],
				2,
				{
					label: 'Ops for Treasury',
					accepted: [s.k3],
					draftedBy: s.k1.address,
				},
			);
			await draftSignerSet(B, [s.k3, s.k4, s.k5], 2, {
				label: 'Ops for Payroll',
				draftedBy: owner.address,
			});
		});

		test('an invitee gets one invitation per account, each in its account context', async () => {
			const items = await invitations(s.k4);
			expect(
				items.map((i) => [
					i.accountAddress,
					i.accountName,
					i.address,
					i.label,
					i.members.map((m) => m.label),
				]),
			).toEqual([
				[
					s.A,
					'Treasury',
					S4,
					'Ops for Treasury',
					['k3 in Treasury', null, null],
				],
				[
					B,
					'Payroll',
					S4,
					'Ops for Payroll',
					['k3 in Payroll', null, null],
				],
			]);
			expect(await summary(s.k5)).toEqual([
				[s.A, s.S3, 'draft'],
				[s.A, S4, 'inviting'],
				[B, S4, 'inviting'],
			]);
		});

		test('one rejection abandons the drafts of the composition on every account', async () => {
			await s.creator.rejectSignerSet(s.k4, S4);
			expect(await linkStatus(s.A, S4)).toBe('abandoned');
			expect(await linkStatus(B, S4)).toBe('abandoned');
			// Other drafts are untouched.
			expect(await linkStatus(s.A, s.S3)).toBe('draft');
			expect(await summary(s.k5)).toEqual([
				[s.A, s.S3, 'draft'],
			]);
		});

		test('a rejection through the legacy route abandons them too', async () => {
			await s.creator.rejectMultisig(s.k4, S4);
			expect(await linkStatus(s.A, S4)).toBe('abandoned');
			expect(await linkStatus(B, S4)).toBe('abandoned');
		});
	});
});
