// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Whole signer changes on the local network, from proposal to execution,
// through the `/v1` routes, with the cast of `setup/signer-changes`, all
// accepted.

import {
	verifyAcceptedBySignerChange,
	type AccountEvent,
} from '@mysten/sagat';
import { type Proposal } from '@mysten/sagat/v1';
import {
	beforeAll,
	describe,
	expect,
	test,
} from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db';
import {
	ProposalStatus,
	SchemaAccountEvents,
	SchemaProposals,
} from '../src/db/schema';
import { ApiAuthError } from '../src/errors';
import {
	ApiTestFramework,
	buildTransfer,
	executeProposal,
	refusal,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import { ageAliasState } from './setup/acting-sets';
import { type GasCoin } from './setup/localnet-transactions';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import {
	addressOf,
	createCast,
	gasCoins,
	proposeCastChange,
	type Cast,
} from './setup/signer-changes';

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

// Executes a proposal on chain with the API's signatures of the set that reached its threshold.
const executeReady = async (proposal: Proposal) => {
	const set = proposal.signerSets.find(
		(s) => s.currentWeight >= s.threshold,
	)!;
	expect(
		(await executeProposal(proposal, set)).effects.status
			.success,
	).toBe(true);
};

// Executes a proposal as `executeReady` does, and verifies it.
const executeAndVerify = async (
	session: TestSession,
	proposal: Proposal,
) => {
	await executeReady(proposal);
	return session.v1.verifyProposalByDigest(proposal.digest);
};

// `key`'s `account.accepted` row for `account`, checked against the change it names.
const verifiedAcceptance = async (
	session: TestSession,
	key: TestUser,
	account: string,
) => {
	const [event] = await db
		.select()
		.from(SchemaAccountEvents)
		.where(
			and(
				eq(SchemaAccountEvents.accountAddress, account),
				eq(SchemaAccountEvents.action, 'account.accepted'),
				eq(SchemaAccountEvents.actor, key.address),
			),
		);
	return verifyAcceptedBySignerChange(
		{
			id: event.id,
			action: event.action,
			actor: event.actor,
			subject: event.subject,
			proof: event.proof as AccountEvent['proof'],
			createdAt: event.createdAt.toISOString(),
		},
		await session.v1.getProposalByDigest(event.subject!),
	);
};

// A member's answer for `account` in its set at `address`, as `key` reads it.
const answerOf = async (
	key: TestUser,
	account: string,
	address: string,
) => {
	const set = (
		await (
			await signedIn(key)
		).getAccount(account, 'localnet')
	).signerSets.find((s) => s.address === address);
	return (
		set?.kind !== 'unknown' &&
		set?.members.find((m) => m.publicKey === key.publicKey)
			?.answer
	);
};

const NOT_A_SIGNER = new ApiAuthError('NotAnAccountSigner')
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

	test('the new k4 signs without counting for S1, the change executes with S1’s signatures, records S1 as what executed it, and the account shows S2 acting and S1 as the original set', async () => {
		const { k1, k2, k3, k4, A, S2 } = cast;
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
		const k1Client = await signedIn(k1);
		const openChange = async () =>
			(await k1Client.getAccount(A, 'localnet'))
				.openSignerChange;
		expect(await openChange()).toBeNull();

		const change = await proposeCastChange(
			session,
			cast,
			S2,
			{
				gasCoin: coins[1],
			},
		);
		const byK4 = await session.voteOnProposal(
			k4,
			change.digest,
			change.transactionBytes,
		);
		expect(byK4.ready).toBe(false);
		expect(byK4.signerSets).toEqual([
			expect.objectContaining({
				address: A,
				currentWeight: 1,
				acting: true,
				original: true,
			}),
		]);
		expect(
			byK4.signatures.map((s) => s.publicKey).sort(),
		).toEqual([k1.publicKey, k4.publicKey].sort());
		const ready = await session.voteOnProposal(
			k2,
			change.digest,
			change.transactionBytes,
		);
		expect(ready.ready).toBe(true);
		expect(await openChange()).toEqual({
			digest: change.digest,
		});
		const verified = await executeAndVerify(session, ready);

		expect(verified.status).toBe('SUCCESS');
		expect(verified.executedVia).toBe(A);
		expect(verified).toMatchObject({
			ready: true,
			signerSets: ready.signerSets,
		});
		const account = await k1Client.getAccount(
			A,
			'localnet',
		);
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
		expect(account.openSignerChange).toBeNull();
		expect(
			(await (await signedIn(k3)).getAccounts('localnet'))
				.removed,
		).toEqual([
			expect.objectContaining({
				address: A,
				publicKey: k3.publicKey,
				signerSetAddress: A,
				transactionDigest: change.digest,
			}),
		]);
	});

	test('the removed k3 may not sign', async () => {
		const { k1, k3, A } = cast;
		pending = await session.createProposal(
			k1,
			A,
			'localnet',
			await buildTransfer(A, { gasCoin: coins[2] }),
		);

		expect(
			await refusal(
				session.voteOnProposal(
					k3,
					pending.digest,
					pending.transactionBytes,
				),
			),
		).toEqual({ status: 403, message: NOT_A_SIGNER });
	});

	test('the new k4, which signed the change, is accepted with no invitation, signs at once, and has a member’s rights at once', async () => {
		const { k4, A, S2 } = cast;
		expect(await invitedTo(k4)).toEqual([]);
		expect(await answerOf(k4, A, addressOf(S2))).toBe(
			'accepted',
		);
		expect(
			await verifiedAcceptance(session, k4, A),
		).toMatchObject({
			status: 'verified',
			signer: k4.address,
		});
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
				acting: true,
			}),
			expect.objectContaining({
				address: cast.A,
				currentWeight: 0,
				acting: false,
				original: true,
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
			labels: [],
		});
		// Only S2 counts; S1 is listed so the account's address can be rebuilt.
		expect(change.ready).toBe(false);
		expect(change.signerSets).toEqual([
			expect.objectContaining({
				address: addressOf(S2),
				currentWeight: 1,
				acting: true,
				original: false,
			}),
			expect.objectContaining({
				address: A,
				currentWeight: 0,
				acting: false,
				original: true,
			}),
		]);
		// `k1` and `k2` stay and meet S1's threshold, so ready without `k3`, whom S1 adds back.
		const ready = await session.voteOnProposal(
			k2,
			change.digest,
			change.transactionBytes,
		);
		expect(ready.ready).toBe(true);
		expect(
			ready.signerSets.map((set) => [
				set.address,
				set.currentWeight,
			]),
		).toEqual([
			[addressOf(S2), 2],
			[A, 0],
		]);
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
			message: NOT_A_SIGNER,
		});
	});

	test('S1 to S3 is not ready at S1’s threshold until S3’s signers meet its own, and S3 acts after it', async () => {
		const { k1, k2, k3, A, S3 } = cast;
		const change = await proposeCastChange(
			session,
			cast,
			S3,
			{
				gasCoin: coins[5],
			},
		);
		const atS1Threshold = await session.voteOnProposal(
			k2,
			change.digest,
			change.transactionBytes,
		);
		expect(atS1Threshold.ready).toBe(false);
		expect(atS1Threshold.signerSets[0]).toMatchObject({
			address: A,
			threshold: 2,
			currentWeight: 2,
		});
		const ready = await session.voteOnProposal(
			k3,
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

describe('a change executed without the API', () => {
	let session: TestSession;
	let cast: Cast;

	beforeAll(async () => {
		framework = new ApiTestFramework(await createTestApp());
		session = framework.createSession();
		cast = await createCast(session);
	});

	test('a change executed outside the API is settled by the next refresh, and a new key that signed it is accepted with no invitation', async () => {
		const { k2, k4, A, S2 } = cast;
		const change = await proposeCastChange(
			session,
			cast,
			S2,
		);
		await session.voteOnProposal(
			k4,
			change.digest,
			change.transactionBytes,
		);
		const ready = await session.voteOnProposal(
			k2,
			change.digest,
			change.transactionBytes,
		);
		expect(ready.ready).toBe(true);
		await executeReady(ready);
		const [stored] = await db
			.select({ status: SchemaProposals.status })
			.from(SchemaProposals)
			.where(eq(SchemaProposals.digest, change.digest));
		expect(stored.status).toBe(ProposalStatus.PENDING);

		// The next read refreshes the stale mirror.
		await ageAliasState(A, 'localnet');
		expect(await answerOf(k4, A, addressOf(S2))).toBe(
			'accepted',
		);

		expect(
			(await session.v1.getProposalByDigest(change.digest))
				.status,
		).toBe('SUCCESS');
		expect(await invitedTo(k4)).not.toContain(A);
		expect(
			await verifiedAcceptance(session, k4, A),
		).toMatchObject({
			status: 'verified',
			signer: k4.address,
		});
	});
});
