// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// A composition is content-addressed and can be linked to several
// accounts (docs/account-rotation.md, data model). Labels, statuses and key
// labels belong to each account's link, so one account's context never
// shows in another's, and key labels never leave an account.

import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import {
	ACCESS_DENIED,
	failureOf,
	newUser,
	type TestUser,
} from './framework/api-test-framework';
import {
	draftSignerSet,
	linkSignerSet,
	rotationScenario,
	secondAccount,
	setAliasMirror,
	type RotationScenario,
} from './framework/rotation';
import { setupSharedTestEnvironment } from './setup/shared-test-setup';

setupSharedTestEnvironment();

// Every key label the scenario sets, in either account.
const KEY_LABELS = [
	"k1's Ledger",
	'k3 in Treasury',
	'k3 in Payroll',
];

const expectNoKeyLabels = (value: unknown) => {
	const serialized = JSON.stringify(value);
	for (const label of KEY_LABELS)
		expect(serialized).not.toContain(label);
};

describe('Rotation: a composition shared by two accounts', () => {
	let s: RotationScenario;
	let B: string;
	let owner: TestUser;

	beforeEach(async () => {
		s = await rotationScenario({ fund: true });
		await setAliasMirror(s.A, 'localnet', {
			aliases: [s.A, s.S2],
		});

		// B: another account with k3 in its original set and its own label
		// for k3. S2 is linked to it too, verified but not in its alias set.
		({ B, owner } = await secondAccount(s));
		await linkSignerSet(B, s.S2, {
			label: 'Ops for Payroll',
			status: 'verified',
			draftedBy: owner.address,
		});
	});

	const compositionFor = async (user: TestUser) =>
		(await s.as(user)).v1.getSignerSet(s.S2);

	test('a member of the composition sees its links to both accounts, each in its own context', async () => {
		expect(await compositionFor(s.k4)).toEqual({
			address: s.S2,
			threshold: 2,
			isVerified: true,
			totalWeight: 2,
			members: [s.k3, s.k4].map((key, order) => ({
				signerSetAddress: s.S2,
				publicKey: key.publicKey,
				weight: 1,
				order,
				isAccepted: true,
				isRejected: false,
			})),
			links: [
				{
					accountAddress: s.A,
					accountName: 'Treasury',
					label: 'Operations',
					status: 'verified',
					draftedBy: s.k1.address,
					createdAt: expect.any(String),
					validOn: ['localnet'],
				},
				{
					accountAddress: B,
					accountName: 'Payroll',
					label: 'Ops for Payroll',
					status: 'verified',
					draftedBy: owner.address,
					createdAt: expect.any(String),
					validOn: [],
				},
			],
		});
		expectNoKeyLabels(await compositionFor(s.k4));
	});

	test('a reader of one account who is not in the composition sees that account only', async () => {
		expect(
			(await compositionFor(s.k1)).links.map(
				(l) => l.accountAddress,
			),
		).toEqual([s.A]);
		expect(
			(await compositionFor(owner)).links.map(
				(l) => l.accountAddress,
			),
		).toEqual([B]);
	});

	test('anyone else is refused, as for an unknown address', async () => {
		expect(
			await failureOf(compositionFor(newUser())),
		).toEqual(ACCESS_DENIED);
		expect(
			await failureOf(
				(await s.as(s.k1)).v1.getSignerSet(
					newUser().address,
				),
			),
		).toEqual(ACCESS_DENIED);
	});

	test("each account shows its own key labels, never the other account's", async () => {
		// S2 becomes valid for B too, so k4 can read B.
		await setAliasMirror(B, 'localnet', {
			aliases: [B, s.S2],
		});
		const fromB = await (await s.as(s.k4)).v1.getAccount(B);
		const s2InB = fromB.signerSets.find(
			(x) => x.address === s.S2,
		)!;
		expect(s2InB).toMatchObject({
			label: 'Ops for Payroll',
			validOn: ['localnet'],
		});
		expect(s2InB.members.map((m) => m.label)).toEqual([
			'k3 in Payroll',
			null,
		]);
		const serialized = JSON.stringify(fromB);
		expect(serialized).not.toContain('Treasury');
		expect(serialized).not.toContain("k1's Ledger");

		const fromA = await (
			await s.as(s.k4)
		).v1.getAccount(s.A);
		expect(
			fromA.signerSets
				.find((x) => x.address === s.S2)!
				.members.map((m) => m.label),
		).toEqual(['k3 in Treasury', null]);
		expect(JSON.stringify(fromA)).not.toContain('Payroll');
	});

	test('an abandoned link is hidden from a member who cannot read its account', async () => {
		const S5 = await draftSignerSet(B, [s.k4, s.k6], 2, {
			label: 'Rejected',
		});
		await s.creator.rejectSignerSet(s.k6, S5);

		const composition = await (
			await s.as(s.k4)
		).v1.getSignerSet(S5);
		expect(composition.links).toEqual([]);
		// The owner of B still sees it, abandoned.
		expect(
			(await (await s.as(owner)).v1.getSignerSet(S5)).links,
		).toMatchObject([
			{ accountAddress: B, status: 'abandoned' },
		]);
	});

	test('key labels never reach the routes without a session, whatever the signer sets', async () => {
		const proposal = await s.creator.proposeTransfer(
			s.k1,
			s.A,
		);
		await s.creator.voteOnProposal(s.k4, proposal);
		const anonymous = s.framework.createSession().v1;

		const byDigest = await anonymous.getProposalByDigest(
			proposal.digest,
		);
		expect(
			byDigest.signerSets.map((x) => x.address),
		).toEqual([s.S1, s.S2]);
		for (const set of byDigest.signerSets)
			for (const member of set.members)
				expect(Object.keys(member).sort()).toEqual([
					'hasSigned',
					'order',
					'publicKey',
					'weight',
				]);
		expectNoKeyLabels(byDigest);

		// Accept and reject return no members.
		const S6 = await draftSignerSet(s.A, [s.k3, s.k6], 1);
		const accepted = await s.framework
			.createSession()
			.acceptSignerSet(s.k3, S6);
		expect(accepted).not.toHaveProperty('members');
		expectNoKeyLabels(accepted);
		const rejected = await s.framework
			.createSession()
			.rejectSignerSet(s.k6, S6);
		expect(rejected).not.toHaveProperty('members');
		expectNoKeyLabels(rejected);

		// The member routes need a session.
		for (const call of [
			anonymous.getSignerSet(s.S2),
			anonymous.getAccount(s.A),
			anonymous.getInvitations(s.k3.publicKey),
			anonymous.getProposals(s.A, 'localnet'),
		])
			expect(await failureOf(call)).toMatchObject({
				status: 401,
			});
	});
});
