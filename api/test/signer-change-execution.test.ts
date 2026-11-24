// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Whole signer changes on the local network, from proposal to execution,
// through the `/v1` routes, with the cast of `setup/signer-changes`, all
// accepted; `R` is another account's composition that shares `k1` and `k2`.

import { buildAdd, type Composition } from '@mysten/sagat';
import { type Proposal } from '@mysten/sagat/v1';
import {
	beforeAll,
	describe,
	expect,
	test,
} from 'bun:test';

import { ApiAuthError } from '../src/errors';
import {
	ApiTestFramework,
	buildTransfer,
	executeProposal,
	newUser,
	refusal,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import {
	addressOf,
	buildFrom,
	compositionOf,
	createCast,
	gasCoins,
	proposeCastChange,
	type Cast,
	type GasCoin,
} from './setup/signer-changes';
import {
	answer,
	changeProposer,
} from './setup/v1-accounts';

setupSharedTestEnvironment();

let framework: ApiTestFramework;

// A `/v1` client signed in as `key` alone.
const signedIn = async (key: TestUser) => {
	const session = framework.createSession();
	await session.connectUser(key);
	return session.v1;
};

const actingSets = async (key: TestUser, account: string) =>
	(
		await (
			await signedIn(key)
		).getAccount(account, 'localnet')
	).signerSets
		.filter((set) => set.kind !== 'unknown' && set.acting)
		.map((set) => set.address)
		.sort();

const invitedTo = async (key: TestUser) =>
	(
		await (await signedIn(key)).getInvitations('localnet')
	).invitations.map((account) => account.address);

const listedFor = async (key: TestUser) =>
	(
		await (await signedIn(key)).getAccounts('localnet')
	).accounts.map((account) => account.address);

// Executes a proposal with the API's signatures of the set that reached its threshold, and verifies it.
const executeAndVerify = async (
	session: TestSession,
	proposal: Proposal,
) => {
	const set = proposal.signerSets.find(
		(s) => s.currentWeight >= s.threshold,
	)!;
	expect(
		(await executeProposal(proposal, set)).effects.status
			.success,
	).toBe(true);
	return session.v1.verifyProposalByDigest(proposal.digest);
};

const NOT_A_MEMBER = new ApiAuthError('NotAMultisigMember')
	.message;

describe('S1 to S2 from proposal to execution, back to S1, then to S3', () => {
	let session: TestSession;
	let cast: Cast;
	let coins: GasCoin[];
	// A transfer proposed before the change, signed by `k1` and `k3`.
	let transfer: Proposal;
	// A transfer proposed after the change.
	let pending: Proposal;

	beforeAll(async () => {
		framework = new ApiTestFramework(await createTestApp());
		session = framework.createSession();
		cast = await createCast(session);
		coins = await gasCoins(cast.A, 6);
	});

	test('executes with its signatures, records S1 as what executed it, and the account shows S2 acting and S1 as the original set', async () => {
		const { k1, k2, k3, A, S2 } = cast;
		const created = await session.createProposal(
			k1,
			A,
			'localnet',
			await buildTransfer(A, { gasCoin: coins[0] }),
		);
		transfer = await session.voteOnProposal(
			k3,
			created.digest,
			created.transactionBytes,
		);
		expect(transfer.ready).toBe(true);

		const change = await proposeCastChange(
			session,
			cast,
			S2,
			{
				gasCoin: coins[1],
			},
		);
		const ready = await session.voteOnProposal(
			k2,
			change.digest,
			change.transactionBytes,
		);
		expect(ready.ready).toBe(true);
		const verified = await executeAndVerify(session, ready);

		expect(verified.status).toBe('SUCCESS');
		expect(verified.executedVia).toBe(A);
		const account = await (
			await signedIn(k1)
		).getAccount(A, 'localnet');
		expect(account.signerSets).toEqual([
			expect.objectContaining({
				address: A,
				acting: false,
				original: true,
			}),
			expect.objectContaining({
				address: addressOf(S2),
				acting: true,
				original: false,
			}),
		]);
	});

	test('the removed k3 is refused everything a signer gets', async () => {
		const { k1, k3, A } = cast;
		pending = await session.createProposal(
			k1,
			A,
			'localnet',
			await buildTransfer(A, { gasCoin: coins[2] }),
		);
		const k3Client = await signedIn(k3);
		const bytes = await buildTransfer(A, {
			gasCoin: coins[3],
		});

		expect(
			await Promise.all(
				[
					k3Client.getAccount(A, 'localnet'),
					k3Client.getProposals({
						accountAddress: A,
						network: 'localnet',
					}),
					session.createProposal(k3, A, 'localnet', bytes),
					session.voteOnProposal(
						k3,
						pending.digest,
						pending.transactionBytes,
					),
					session.cancelProposal(k3, pending),
					changeProposer(
						framework,
						'add',
						k3,
						A,
						newUser().address,
					),
					changeProposer(
						framework,
						'remove',
						k3,
						A,
						k1.address,
					),
				].map(refusal),
			),
		).toEqual([
			{
				status: 403,
				message: new ApiAuthError('AccessDenied').message,
			},
			{ status: 403, message: NOT_A_MEMBER },
			{ status: 403, message: NOT_A_MEMBER },
			{ status: 403, message: NOT_A_MEMBER },
			{
				status: 400,
				message: 'Not a member of the multisig',
			},
			{ status: 403, message: NOT_A_MEMBER },
			{ status: 403, message: NOT_A_MEMBER },
		]);
	});

	test('the new k4 is invited, shown as invited, signs at once, and gets a member’s rights once it accepts', async () => {
		const { k4, A, S2 } = cast;
		expect(await invitedTo(k4)).toEqual([A]);
		const account = await (
			await signedIn(k4)
		).getAccount(A, 'localnet');
		const s2 = account.signerSets[1];
		expect(s2.address).toBe(addressOf(S2));
		expect(
			s2.kind !== 'unknown' &&
				s2.members.find((m) => m.publicKey === k4.publicKey)
					?.answer,
		).toBe('invited');
		const voted = await session.voteOnProposal(
			k4,
			pending.digest,
			pending.transactionBytes,
		);
		expect(voted.ready).toBe(true);

		const k4Client = await signedIn(k4);
		const bytes = await buildTransfer(A, {
			gasCoin: coins[3],
		});
		const listProposals = () =>
			k4Client.getProposals({
				accountAddress: A,
				network: 'localnet',
			});
		const propose = () =>
			session.createProposal(k4, A, 'localnet', bytes);
		expect(await listedFor(k4)).toEqual([]);
		expect(await refusal(listProposals())).toEqual({
			status: 403,
			message: NOT_A_MEMBER,
		});
		expect(await refusal(propose())).toEqual({
			status: 403,
			message: NOT_A_MEMBER,
		});

		await answer(framework, k4, A, 'accept');

		expect(await listedFor(k4)).toEqual([A]);
		expect((await listProposals()).proposals).toHaveLength(
			4,
		);
		expect((await propose()).status).toBe('PENDING');
	});

	test('the transfer proposed before the change counts k1 only under S2, keeps k3’s signature, and executes with S2 once k2 signs', async () => {
		const { k1, k2, k3, S2 } = cast;
		const read = await session.v1.getProposalByDigest(
			transfer.digest,
		);
		expect(
			read.signatures.map((s) => s.publicKey).sort(),
		).toEqual([k1.publicKey, k3.publicKey].sort());
		expect(read.signerSets).toEqual([
			expect.objectContaining({
				address: addressOf(S2),
				currentWeight: 1,
			}),
		]);
		expect(read.ready).toBe(false);

		const ready = await session.voteOnProposal(
			k2,
			transfer.digest,
			transfer.transactionBytes,
		);
		expect(ready.ready).toBe(true);
		const verified = await executeAndVerify(session, ready);

		expect(verified.status).toBe('SUCCESS');
		expect(verified.executedVia).toBe(addressOf(S2));
	});

	test('S2 back to S1 adds the account’s own address back; k3 acts again without a new invitation, and k4 is removed', async () => {
		const { k2, k3, k4, A, S1, S2 } = cast;
		const change = await proposeCastChange(
			session,
			cast,
			S1,
			{
				oldSet: addressOf(S2),
				known: [S1, S2],
				gasCoin: coins[4],
			},
		);
		expect(change.signerChange).toEqual({
			removes: addressOf(S2),
			adds: A,
		});
		const ready = await session.voteOnProposal(
			k2,
			change.digest,
			change.transactionBytes,
		);
		const verified = await executeAndVerify(session, ready);

		expect(verified.status).toBe('SUCCESS');
		expect(verified.executedVia).toBe(addressOf(S2));
		expect(await actingSets(k3, A)).toEqual([A]);
		expect(await listedFor(k3)).toEqual([A]);
		expect(await invitedTo(k3)).toEqual([]);
		expect(
			await refusal(
				(await signedIn(k4)).getAccount(A, 'localnet'),
			),
		).toEqual({
			status: 403,
			message: new ApiAuthError('AccessDenied').message,
		});
	});

	test('S1 to S3 is ready at S1’s threshold, and S3 acts after it', async () => {
		const { k1, k2, A, S3 } = cast;
		const change = await proposeCastChange(
			session,
			cast,
			S3,
			{
				gasCoin: coins[5],
			},
		);
		const ready = await session.voteOnProposal(
			k2,
			change.digest,
			change.transactionBytes,
		);
		expect(ready.ready).toBe(true);
		const verified = await executeAndVerify(session, ready);
		expect(verified.status).toBe('SUCCESS');
		expect(verified.executedVia).toBe(A);
		expect(await actingSets(k1, A)).toEqual([
			addressOf(S3),
		]);
	});
});

describe('a change to a composition that is already an alias', () => {
	let session: TestSession;
	let cast: Cast;
	let coins: GasCoin[];
	let R: Composition;
	// `R`'s member who never answers for `A`.
	let k5: TestUser;

	beforeAll(async () => {
		framework = new ApiTestFramework(await createTestApp());
		session = framework.createSession();
		cast = await createCast(session);
		coins = await gasCoins(cast.A, 2);
	});

	test('another account’s composition added by a hand-written proposal acts beside S1', async () => {
		const { k1, k2, A } = cast;
		k5 = newUser();
		R = compositionOf([k1, k2, k5], 2);
		const { address } = await session.createMultisig(
			[k1, k2, k5],
			2,
		);
		expect(address).toBe(addressOf(R));
		const created = await session.createProposal(
			k1,
			A,
			'localnet',
			await buildFrom(
				A,
				(tx) =>
					buildAdd(tx, { account: A, alias: address }),
				coins[0],
			),
		);
		await session.voteAndExecute([k2], created.digest);

		expect(await actingSets(k1, A)).toEqual(
			[A, address].sort(),
		);
	});

	test('the change only removes S1, is ready at S1’s threshold, also with a removed signer’s signature, and R acts after it', async () => {
		const { k1, k2, k3, A, S1 } = cast;
		const change = await proposeCastChange(
			session,
			cast,
			R,
			{
				known: [S1, R],
				gasCoin: coins[1],
			},
		);
		const ready = await session.voteOnProposal(
			k3,
			change.digest,
			change.transactionBytes,
		);
		expect(ready.ready).toBe(true);
		const verified = await executeAndVerify(session, ready);

		expect(verified.status).toBe('SUCCESS');
		expect(verified.executedVia).toBe(A);
		expect(await actingSets(k1, A)).toEqual([addressOf(R)]);
		expect(await invitedTo(k5)).toContain(A);
		for (const key of [k1, k2])
			expect(await invitedTo(key)).not.toContain(A);
	});
});
