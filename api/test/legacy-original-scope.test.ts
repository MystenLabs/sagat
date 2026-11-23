// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The legacy routes ask for the original signer set, and refuse an account whose alias mirror says another composition acts.

import {
	defaultExpiry,
	PersonalMessages,
	ProposalStatus,
} from '@mysten/sagat';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';
import { asc, eq } from 'drizzle-orm';

import { db } from '../src/db';
import {
	SchemaProposals,
	SchemaSignerSetMembers,
} from '../src/db/schema';
import { AuthErrors } from '../src/errors';
import {
	ApiTestFramework,
	buildTransfer,
	errorOf,
	executeProposal,
	newUser,
	sign,
	signedBy,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import { answerFor, setAliases } from './setup/acting-sets';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import {
	insertProposal,
	offlineTransfer,
} from './setup/v1-proposals';

setupSharedTestEnvironment();

let framework: ApiTestFramework;

beforeEach(async () => {
	framework = new ApiTestFramework(await createTestApp());
});

// `A`: original set 2 of 4 (`k1`, `k2` accepted, `k3`, `k4` invited), funded.
// `change` writes the mirror rows that say composition `R` acts on localnet
// and `A` does not, and that `r1` of `R` accepted `A`.
const setup = async () => {
	const [k1, k2, k3, k4, r1] = [
		newUser(),
		newUser(),
		newUser(),
		newUser(),
		newUser(),
	];
	const session = framework.createSession();
	for (const user of [k1, k2])
		await session.connectUser(user);
	const account = (
		await session.createMultisig([k1, k2, k3, k4], 2, {
			fund: true,
		})
	).address;

	const invitee = framework.createSession();
	await invitee.connectUser(k3);

	const outsider = framework.createSession();
	await outsider.connectUser(r1);
	const composition = (
		await outsider.createMultisig([r1, newUser()], 1)
	).address;

	const change = async () => {
		await setAliases(account, 'localnet', [composition]);
		await answerFor(account, r1, 'accepted');
	};

	return {
		k1,
		k2,
		k3,
		k4,
		r1,
		account,
		session,
		invitee,
		outsider,
		change,
	};
};

// A legacy transfer proposal by `proposer`.
const proposeTransfer = async (
	session: TestSession,
	proposer: TestUser,
	account: string,
) => {
	return session.legacyPropose(
		proposer,
		account,
		await buildTransfer(account),
	);
};

const connectionsOf = async (
	session: TestSession,
	user: TestUser,
) =>
	(await session.client.getMultisigConnections())[
		user.publicKey
	].map((multisig) => multisig.address);

const SERVED_BY_V1 = {
	status: 409,
	body: {
		error:
			'An account whose signers changed is served by the /v1 routes only.',
	},
};

// Each legacy route about the account or its pending `proposal`, called by `user`.
const accountRoutes = async (
	session: TestSession,
	user: TestUser,
	account: string,
	proposal: {
		id: number;
		digest: string;
		transactionBytes: string;
	},
) => {
	const transactionBytes = await offlineTransfer(account);
	const proposer = newUser().address;
	const expiry = defaultExpiry();
	return {
		read: await errorOf(
			await session.request(`/multisig/${account}`),
		),
		proposals: await errorOf(
			await session.request(
				`/proposals?multisigAddress=${account}&network=localnet`,
			),
		),
		byDigest: await errorOf(
			await session.request(
				`/proposals/digest/${proposal.digest}`,
			),
		),
		create: await errorOf(
			await session.post('/proposals', {
				multisigAddress: account,
				network: 'localnet',
				transactionBytes,
				signature: await signedBy(user, transactionBytes),
			}),
		),
		vote: await errorOf(
			await session.post(`/proposals/${proposal.id}/vote`, {
				signature: await signedBy(
					user,
					proposal.transactionBytes,
				),
			}),
		),
		cancel: await errorOf(
			await session.post(
				`/proposals/${proposal.id}/cancel`,
				{
					signature: await sign(
						user,
						PersonalMessages.cancelProposal(
							proposal.digest,
							account,
						),
					),
				},
			),
		),
		addProposer: await errorOf(
			await session.post(
				`/multisig/${account}/add-proposer`,
				{
					proposer,
					expiry,
					signature: await sign(
						user,
						PersonalMessages.addMultisigProposer(
							proposer,
							account,
							expiry,
						),
					),
				},
			),
		),
		removeProposer: await errorOf(
			await session.post(
				`/multisig/${account}/remove-proposer`,
				{
					proposer,
					expiry,
					signature: await sign(
						user,
						PersonalMessages.removeMultisigProposer(
							proposer,
							account,
							expiry,
						),
					),
				},
			),
		),
	};
};

const EVERY_ROUTE_REFUSED = {
	read: SERVED_BY_V1,
	proposals: SERVED_BY_V1,
	byDigest: SERVED_BY_V1,
	create: SERVED_BY_V1,
	vote: SERVED_BY_V1,
	cancel: SERVED_BY_V1,
	addProposer: SERVED_BY_V1,
	removeProposer: SERVED_BY_V1,
};

describe('legacy routes under alias mirror rows', () => {
	test("the original set's keys get a 409 from every legacy route about the account, and keep the open ones", async () => {
		const {
			k1,
			k2,
			k3,
			k4,
			account,
			session,
			invitee,
			change,
		} = await setup();

		expect(await connectionsOf(session, k1)).toContain(
			account,
		);
		expect(
			(
				await invitee.client.getInvitations(k3.publicKey)
			).map((multisig) => multisig.address),
		).toContain(account);
		expect(
			(await session.client.getMultisig(account)).address,
		).toBe(account);

		const bot = newUser();
		await session.addProposer(k1, bot.address, account);
		expect(
			(
				await session.client.getMultisig(account)
			).proposers.map((p) => p.address),
		).toEqual([bot.address]);
		await session.removeProposer(k1, bot.address, account);
		expect(
			(await session.client.getMultisig(account)).proposers,
		).toEqual([]);

		const cancelled = await proposeTransfer(
			session,
			k1,
			account,
		);
		await session.legacyCancel(k1, cancelled, account);

		// Executed before the change; verified after it.
		const proposal = await proposeTransfer(
			session,
			k1,
			account,
		);
		expect(
			(
				await session.client.getProposals(
					account,
					'localnet',
					{},
				)
			).data.map((p) => [p.id, p.status]),
		).toEqual([
			[proposal.id, ProposalStatus.PENDING],
			[cancelled.id, ProposalStatus.CANCELLED],
		]);
		expect(await session.legacyVote(k2, proposal)).toEqual({
			hasReachedThreshold: true,
			currentWeight: 2,
		});
		const response = await session.request(
			`/proposals/digest/${proposal.digest}`,
		);
		expect(response.status).toBe(200);
		const byDigest = await response.json();
		expect(byDigest.currentWeight).toBe(2);
		expect(byDigest.multisig.address).toBe(account);
		expect(
			byDigest.multisig.members.map(
				(m: { publicKey: string }) => m.publicKey,
			),
		).toEqual([
			k1.publicKey,
			k2.publicKey,
			k3.publicKey,
			k4.publicKey,
		]);
		const legacyProposal =
			await session.client.getProposalByDigest(
				proposal.digest,
			);
		const tx = await executeProposal(
			legacyProposal,
			legacyProposal.multisig,
		);
		expect(tx.effects.status.success).toBe(true);

		await change();

		expect(await connectionsOf(session, k1)).not.toContain(
			account,
		);
		expect(
			(
				await invitee.client.getInvitations(k3.publicKey)
			).map((multisig) => multisig.address),
		).not.toContain(account);
		await invitee.acceptMultisig(k3, account);
		await invitee.rejectMultisig(k4, account);
		expect(
			await db
				.select({
					publicKey: SchemaSignerSetMembers.publicKey,
					isAccepted: SchemaSignerSetMembers.isAccepted,
					isRejected: SchemaSignerSetMembers.isRejected,
				})
				.from(SchemaSignerSetMembers)
				.where(
					eq(
						SchemaSignerSetMembers.signerSetAddress,
						account,
					),
				)
				.orderBy(asc(SchemaSignerSetMembers.order)),
		).toEqual([
			{
				publicKey: k1.publicKey,
				isAccepted: true,
				isRejected: false,
			},
			{
				publicKey: k2.publicKey,
				isAccepted: true,
				isRejected: false,
			},
			{
				publicKey: k3.publicKey,
				isAccepted: true,
				isRejected: false,
			},
			{
				publicKey: k4.publicKey,
				isAccepted: false,
				isRejected: true,
			},
		]);

		const pending = await insertProposal(
			account,
			'localnet',
			k1.address,
		);
		expect(
			await accountRoutes(session, k1, account, pending),
		).toEqual(EVERY_ROUTE_REFUSED);

		expect(
			await errorOf(
				await session.post(
					`/proposals/${pending.digest}/verify-by-digest`,
					{},
				),
			),
		).toEqual({
			status: 400,
			body: { error: 'Proposal is not ready to execute' },
		});
		await session.client.verifyProposalByDigest(
			proposal.digest,
		);
		const [{ status }] = await db
			.select({ status: SchemaProposals.status })
			.from(SchemaProposals)
			.where(eq(SchemaProposals.id, proposal.id));
		expect(status).toBe(ProposalStatus.SUCCESS);

		const verified = await session.post(
			`/proposals/${proposal.id}/verify`,
			{},
		);
		expect(verified.status).toBe(200);
		expect(await verified.json()).toEqual({
			verified: true,
		});

		await session.client.registerAddresses();
		expect(
			(await session.request(`/addresses/${k1.address}`))
				.status,
		).toBe(200);
		expect(
			(await session.createMultisig([k1, newUser()], 1))
				.address,
		).not.toBe(account);
	});

	test('a key of another acting set gets nothing from a legacy route', async () => {
		const { k1, r1, account, outsider, change } =
			await setup();
		await change();
		const proposal = await insertProposal(
			account,
			'localnet',
			k1.address,
		);

		expect(await connectionsOf(outsider, r1)).not.toContain(
			account,
		);
		expect(
			(
				await outsider.client.getInvitations(r1.publicKey)
			).map((multisig) => multisig.address),
		).not.toContain(account);

		// The refusal comes before the member check.
		expect(
			await accountRoutes(outsider, r1, account, proposal),
		).toEqual(EVERY_ROUTE_REFUSED);

		expect(
			await errorOf(
				await outsider.post(
					`/proposals/${proposal.id}/verify`,
					{},
				),
			),
		).toEqual({
			status: 403,
			body: { error: AuthErrors.NotAMultisigMember },
		});
	});
});
