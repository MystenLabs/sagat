// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The legacy routes ask for the original signer set, whatever the alias mirror says acts.

import {
	defaultExpiry,
	PersonalMessages,
	ProposalStatus,
} from '@mysten/sagat';
import { fromBase64 } from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import { AuthErrors } from '../src/errors';
import {
	ApiTestFramework,
	buildTransfer,
	errorOf,
	newUser,
	sign,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import { answerFor, setAliases } from './setup/acting-sets';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

let framework: ApiTestFramework;

beforeEach(async () => {
	framework = new ApiTestFramework(await createTestApp());
});

// `A`: original set 2 of 4 (`k1`, `k2` accepted, `k3`, `k4` invited), funded. The
// mirror says composition `R` acts on localnet and `A` does not, and `r1`
// of `R` accepted `A`.
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

	await setAliases(account, 'localnet', [composition]);
	await answerFor(account, r1, 'accepted');

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
	};
};

const connectionsOf = async (
	session: TestSession,
	user: TestUser,
) =>
	(await session.client.getMultisigConnections())[
		user.publicKey
	].map((multisig) => multisig.address);

describe('legacy routes under alias mirror rows', () => {
	test("the original set's keys keep every legacy route", async () => {
		const { k1, k2, k3, k4, account, session, invitee } =
			await setup();

		expect(await connectionsOf(session, k1)).toContain(
			account,
		);
		expect(
			(
				await invitee.client.getInvitations(k3.publicKey)
			).map((multisig) => multisig.address),
		).toContain(account);
		await invitee.acceptMultisig(k3, account);
		await invitee.rejectMultisig(k4, account);

		const multisig =
			await session.client.getMultisig(account);
		expect(multisig.address).toBe(account);
		expect(
			multisig.members.map((m) => [
				m.publicKey,
				m.isAccepted,
				m.isRejected,
			]),
		).toEqual([
			[k1.publicKey, true, false],
			[k2.publicKey, true, false],
			[k3.publicKey, true, false],
			[k4.publicKey, false, true],
		]);

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

		const cancelled = await session.proposeTransfer(
			k1,
			account,
		);
		await session.cancelProposal(k1, cancelled);

		const proposal = await session.proposeTransfer(
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

		expect(
			await session.voteOnProposal(
				k2,
				proposal.id,
				proposal.transactionBytes,
			),
		).toEqual({
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

		const tx = await session.voteAndExecute(
			[k1, k2],
			proposal.digest,
		);
		expect(tx.effects.status.success).toBe(true);
		expect(
			(
				await session.client.getProposalByDigest(
					proposal.digest,
				)
			).status,
		).toBe(ProposalStatus.SUCCESS);

		const verified = await session.post(
			`/proposals/${proposal.id}/verify`,
			{},
		);
		expect(verified.status).toBe(200);
		expect(await verified.json()).toEqual({
			verified: true,
		});
	});

	test('a key of another acting set gets nothing from a legacy route', async () => {
		const { k1, r1, account, session, outsider } =
			await setup();
		const proposal = await session.proposeTransfer(
			k1,
			account,
		);
		const notAMember = {
			status: 403,
			body: { error: AuthErrors.NotAMultisigMember },
		};

		expect(await connectionsOf(outsider, r1)).not.toContain(
			account,
		);
		expect(
			(
				await outsider.client.getInvitations(r1.publicKey)
			).map((multisig) => multisig.address),
		).not.toContain(account);

		expect(
			await errorOf(
				await outsider.request(`/multisig/${account}`),
			),
		).toEqual({
			status: 403,
			body: { error: AuthErrors.AccessDenied },
		});

		const transactionBytes = await buildTransfer(account);
		expect(
			await errorOf(
				await outsider.post('/proposals', {
					multisigAddress: account,
					network: 'localnet',
					transactionBytes,
					signature: (
						await r1.keypair.signTransaction(
							fromBase64(transactionBytes),
						)
					).signature,
				}),
			),
		).toEqual(notAMember);

		expect(
			await errorOf(
				await outsider.post(
					`/proposals/${proposal.id}/vote`,
					{
						signature: (
							await r1.keypair.signTransaction(
								fromBase64(proposal.transactionBytes),
							)
						).signature,
					},
				),
			),
		).toEqual(notAMember);

		expect(
			await errorOf(
				await outsider.post(
					`/proposals/${proposal.id}/cancel`,
					{
						signature: await sign(
							r1,
							PersonalMessages.cancelProposal(
								proposal.digest,
								account,
							),
						),
					},
				),
			),
		).toEqual({
			status: 400,
			body: { error: 'Not a member of the multisig' },
		});

		expect(
			await errorOf(
				await outsider.request(
					`/proposals?multisigAddress=${account}&network=localnet`,
				),
			),
		).toEqual(notAMember);

		const proposer = newUser().address;
		const expiry = defaultExpiry();
		expect(
			await errorOf(
				await outsider.post(
					`/multisig/${account}/add-proposer`,
					{
						proposer,
						expiry,
						signature: await sign(
							r1,
							PersonalMessages.addMultisigProposer(
								proposer,
								account,
								expiry,
							),
						),
					},
				),
			),
		).toEqual(notAMember);

		expect(
			await errorOf(
				await outsider.post(
					`/multisig/${account}/remove-proposer`,
					{
						proposer,
						expiry,
						signature: await sign(
							r1,
							PersonalMessages.removeMultisigProposer(
								proposer,
								account,
								expiry,
							),
						),
					},
				),
			),
		).toEqual(notAMember);

		expect(
			await errorOf(
				await outsider.post(
					`/proposals/${proposal.id}/verify`,
					{},
				),
			),
		).toEqual(notAMember);
	});
});
