// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Whole signer changes on the local network, from proposal to execution,
// through the `/v1` routes. The cast is the design's: account `A` with `S1` =
// 2-of-3 of `k1`, `k2`, `k3`, all accepted; `S2` = `k1`, `k2`, `k4`; `S3` =
// 3-of-3 of `S1`'s keys; `R`, another account's composition that shares `k1`
// and `k2`.

import { buildAdd, type Composition } from '@mysten/sagat';
import { type Proposal } from '@mysten/sagat/v1';
import { fromBase64 } from '@mysten/sui/utils';
import {
	beforeAll,
	describe,
	expect,
	test,
} from 'bun:test';

import { ProposalStatus } from '../src/db/schema';
import { ApiAuthError } from '../src/errors';
import { refreshAliases } from '../src/services/aliases.service';
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
	execute,
	expectSuccess,
	multisigSigner,
} from './setup/localnet-transactions';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import {
	addressOf,
	allowSignerChanges,
	buildChange,
	buildFrom,
	compositionOf,
	gasCoins,
	proposeChange,
	type GasCoin,
} from './setup/signer-changes';
import {
	answer,
	changeProposer,
} from './setup/v1-accounts';

setupSharedTestEnvironment();

type Cast = Awaited<ReturnType<typeof createCast>>;

let framework: ApiTestFramework;

// `A` with `S1`, all accepted, funded, with signer changes allowed, and `count` gas coins of its own.
const createCast = async (
	session: TestSession,
	count: number,
) => {
	const [k1, k2, k3, k4] = Array.from(
		{ length: 4 },
		newUser,
	);
	for (const key of [k1, k2, k3])
		await session.connectUser(key);
	const S1 = compositionOf([k1, k2, k3], 2);
	const { address: A } = await session.createMultisig(
		[k1, k2, k3],
		2,
		{ fund: true },
	);
	await allowSignerChanges(session, A, [k1, k2]);
	return {
		k1,
		k2,
		k3,
		k4,
		A,
		S1,
		S2: compositionOf([k1, k2, k4], 2),
		S3: compositionOf([k1, k2, k3], 3),
		coins: await gasCoins(A, count),
	};
};

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
	).signerSets.map((set) => set.address);

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
		(s) => s.hasReachedThreshold,
	)!;
	expect(
		(await executeProposal(proposal, set)).effects.status
			.success,
	).toBe(true);
	return session.v1.verifyProposalByDigest(proposal.digest);
};

// Proposes the change from `oldSet` to `newSet`, by `k1`, paid with `gasCoin`.
const proposeBy = async (
	session: TestSession,
	{ k1, A }: Cast,
	{
		oldSet,
		newSet,
		known,
		gasCoin,
	}: {
		oldSet: string;
		newSet: Composition;
		known: Composition[];
		gasCoin: GasCoin;
	},
) =>
	proposeChange(
		session,
		k1,
		A,
		await buildChange({
			account: A,
			oldSet,
			newSet,
			known,
			gasCoin,
		}),
	);

const NOT_A_MEMBER = new ApiAuthError('NotAMultisigMember')
	.message;

describe('S1 to S2 from proposal to execution, then back to S1', () => {
	let session: TestSession;
	let cast: Cast;
	// A transfer proposed before the change, signed by `k1` and `k3`.
	let transfer: Proposal;
	// A transfer proposed after the change.
	let pending: Proposal;

	beforeAll(async () => {
		framework = new ApiTestFramework(await createTestApp());
		session = framework.createSession();
		cast = await createCast(session, 5);
	});

	test('executes with the released signatures, records S1 as what executed it, and the account shows S2 acting and S1 as the original set', async () => {
		const { k1, k2, k3, A, S1, S2, coins } = cast;
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
		expect(transfer.hasReachedThreshold).toBe(true);

		const change = await proposeBy(session, cast, {
			oldSet: A,
			newSet: S2,
			known: [S1],
			gasCoin: coins[1],
		});
		const ready = await session.voteOnProposal(
			k2,
			change.digest,
			change.transactionBytes,
		);
		expect(ready.signerChange?.ready).toBe(true);
		const verified = await executeAndVerify(session, ready);

		expect(verified.status).toBe(ProposalStatus.SUCCESS);
		expect(verified.executedVia).toBe(A);
		const account = await (
			await signedIn(k1)
		).getAccount(A, 'localnet');
		expect(account.originalSignerSet.address).toBe(A);
		expect(
			account.signerSets.map((s) => s.address),
		).toEqual([addressOf(S2)]);
	});

	test('the removed k3 is refused everything a signer gets', async () => {
		const { k1, k3, A, coins } = cast;
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
		const { k4, A, coins } = cast;
		expect(await invitedTo(k4)).toEqual([A]);
		const account = await (
			await signedIn(k4)
		).getAccount(A, 'localnet');
		expect(
			account.signerSets[0].members.find(
				(m) => m.publicKey === k4.publicKey,
			)?.answer,
		).toBe('invited');
		const voted = await session.voteOnProposal(
			k4,
			pending.digest,
			pending.transactionBytes,
		);
		expect(voted.hasReachedThreshold).toBe(true);

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
		expect((await propose()).status).toBe(
			ProposalStatus.PENDING,
		);
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
				hasReachedThreshold: false,
			}),
		]);
		expect(read.hasReachedThreshold).toBe(false);

		const ready = await session.voteOnProposal(
			k2,
			transfer.digest,
			transfer.transactionBytes,
		);
		expect(ready.hasReachedThreshold).toBe(true);
		const verified = await executeAndVerify(session, ready);

		expect(verified.status).toBe(ProposalStatus.SUCCESS);
		expect(verified.executedVia).toBe(addressOf(S2));
	});

	test('S2 back to S1 adds the account’s own address back; k3 acts again without a new invitation, and k4 is removed', async () => {
		const { k2, k3, k4, A, S1, S2, coins } = cast;
		const change = await proposeBy(session, cast, {
			oldSet: addressOf(S2),
			newSet: S1,
			known: [S1, S2],
			gasCoin: coins[4],
		});
		expect(change.aliasCalls).toEqual([
			{ function: 'add', aliases: [A] },
			{ function: 'remove', aliases: [addressOf(S2)] },
		]);
		const ready = await session.voteOnProposal(
			k2,
			change.digest,
			change.transactionBytes,
		);
		const verified = await executeAndVerify(session, ready);

		expect(verified.status).toBe(ProposalStatus.SUCCESS);
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
});

describe('a composition left by a cancelled change, and a change of the threshold only', () => {
	let session: TestSession;
	let cast: Cast;

	beforeAll(async () => {
		framework = new ApiTestFramework(await createTestApp());
		session = framework.createSession();
		cast = await createCast(session, 3);
	});

	test('a composition left by a cancelled change can still become an account', async () => {
		const { k1, k2, k4, A, S1, S2, coins } = cast;
		const change = await proposeBy(session, cast, {
			oldSet: A,
			newSet: S2,
			known: [S1],
			gasCoin: coins[0],
		});
		await session.cancelProposal(k1, change);

		const created = await session.createMultisig(
			[k1, k2, k4],
			2,
		);

		expect(created.address).toBe(addressOf(S2));
		// The change's member rows answered for nothing, so only the creator's keys accept.
		expect(
			created.members.map((m) => [
				m.publicKey,
				m.isAccepted,
			]),
		).toEqual([
			[k1.publicKey, true],
			[k2.publicKey, true],
			[k4.publicKey, false],
		]);
	});

	test('S1 to S3 executes once all three have signed, and afterwards an ordinary proposal needs three', async () => {
		const { k1, k2, k3, A, S1, S3, coins } = cast;
		const change = await proposeBy(session, cast, {
			oldSet: A,
			newSet: S3,
			known: [S1],
			gasCoin: coins[1],
		});
		expect(
			(
				await session.voteOnProposal(
					k2,
					change.digest,
					change.transactionBytes,
				)
			).signerChange?.ready,
		).toBe(false);
		const ready = await session.voteOnProposal(
			k3,
			change.digest,
			change.transactionBytes,
		);
		const verified = await executeAndVerify(session, ready);
		expect(verified.status).toBe(ProposalStatus.SUCCESS);
		expect(verified.executedVia).toBe(A);
		expect(await actingSets(k1, A)).toEqual([
			addressOf(S3),
		]);

		const transfer = await session.createProposal(
			k1,
			A,
			'localnet',
			await buildTransfer(A, { gasCoin: coins[2] }),
		);
		const two = await session.voteOnProposal(
			k2,
			transfer.digest,
			transfer.transactionBytes,
		);
		expect(two.hasReachedThreshold).toBe(false);
		const three = await session.voteOnProposal(
			k3,
			transfer.digest,
			transfer.transactionBytes,
		);
		expect(three.hasReachedThreshold).toBe(true);
	});
});

describe('a change to a composition that is already an alias', () => {
	let session: TestSession;
	let cast: Cast;
	let R: Composition;
	// `R`'s member who never answers for `A`.
	let k5: TestUser;

	beforeAll(async () => {
		framework = new ApiTestFramework(await createTestApp());
		session = framework.createSession();
		cast = await createCast(session, 2);
	});

	test('another account’s composition added by a hand-written proposal acts beside S1', async () => {
		const { k1, k2, A, coins } = cast;
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

	test('the change only removes S1, is ready once signers who stay have signed for R’s threshold, and R acts after it', async () => {
		const { k1, k2, k3, A, S1, coins } = cast;
		const change = await proposeBy(session, cast, {
			oldSet: A,
			newSet: R,
			known: [S1, R],
			gasCoin: coins[1],
		});
		expect(change.aliasCalls).toEqual([
			{ function: 'remove', aliases: [A] },
		]);
		const removedSigned = await session.voteOnProposal(
			k3,
			change.digest,
			change.transactionBytes,
		);
		expect(removedSigned.signerChange?.ready).toBe(false);
		const ready = await session.voteOnProposal(
			k2,
			change.digest,
			change.transactionBytes,
		);
		expect(ready.signerChange?.ready).toBe(true);
		const verified = await executeAndVerify(session, ready);

		expect(verified.status).toBe(ProposalStatus.SUCCESS);
		expect(verified.executedVia).toBe(A);
		expect(await actingSets(k1, A)).toEqual([addressOf(R)]);
		expect(await invitedTo(k5)).toContain(A);
		for (const key of [k1, k2])
			expect(await invitedTo(key)).not.toContain(A);
	});
});

describe('signer changes executed outside the API', () => {
	let session: TestSession;
	let cast: Cast;
	// `k1` and `k2` alone, 2 of 2.
	let T: Composition;

	beforeAll(async () => {
		framework = new ApiTestFramework(await createTestApp());
		session = framework.createSession();
		cast = await createCast(session, 3);
		T = compositionOf([cast.k1, cast.k2], 2);
	});

	// Signs the proposal's bytes with the first `threshold` keys of the set and executes them, with no vote and no verify.
	const executeByHand = async (
		{ transactionBytes }: Proposal,
		keys: TestUser[],
		threshold: number,
	) => {
		const bytes = fromBase64(transactionBytes);
		expectSuccess(
			await execute(
				bytes,
				await multisigSigner(
					'old set',
					keys.map((k) => k.keypair),
					threshold,
				).sign(bytes),
			),
		);
	};

	test('a change that was never ready in the API, executed on chain, is settled at the next refresh and the new set acts', async () => {
		const { k1, k2, k3, k4, A, S1, S2, coins } = cast;
		const change = await proposeBy(session, cast, {
			oldSet: A,
			newSet: S2,
			known: [S1],
			gasCoin: coins[0],
		});
		expect(change.signerChange?.ready).toBe(false);

		await executeByHand(change, [k1, k2, k3], 2);
		await refreshAliases([A], 'localnet');

		const read = await session.v1.getProposalByDigest(
			change.digest,
		);
		expect(read.status).toBe(ProposalStatus.SUCCESS);
		expect(read.executedVia).toBe(A);
		expect(await actingSets(k1, A)).toEqual([
			addressOf(S2),
		]);
		expect(
			await refusal(
				(await signedIn(k3)).getAccount(A, 'localnet'),
			),
		).toEqual({
			status: 403,
			message: new ApiAuthError('AccessDenied').message,
		});
		expect(await invitedTo(k4)).toEqual([A]);
	});

	test('a cancelled change executed on chain takes its outcome in place of cancelled at the next refresh, and a new change can be proposed', async () => {
		const { k1, k2, k4, A, S1, S2, coins } = cast;
		const change = await proposeBy(session, cast, {
			oldSet: addressOf(S2),
			newSet: T,
			known: [S1, S2],
			gasCoin: coins[1],
		});
		await session.cancelProposal(k1, change);

		await executeByHand(change, [k1, k2, k4], 2);
		await refreshAliases([A], 'localnet');

		const read = await session.v1.getProposalByDigest(
			change.digest,
		);
		expect(read.status).toBe(ProposalStatus.SUCCESS);
		expect(read.executedVia).toBe(addressOf(S2));
		expect(await actingSets(k1, A)).toEqual([addressOf(T)]);
		const next = await proposeBy(session, cast, {
			oldSet: addressOf(T),
			newSet: S1,
			known: [S1, T],
			gasCoin: coins[2],
		});
		expect(next.status).toBe(ProposalStatus.PENDING);
	});
});
