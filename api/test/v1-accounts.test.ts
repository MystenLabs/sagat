// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	defaultExpiry,
	deriveAliasesObjectId,
	PersonalMessages,
	verifyAccountEvent,
} from '@mysten/sagat';
import {
	beforeEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from 'bun:test';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '../src/db';
import {
	SchemaAccountAcceptances,
	SchemaAccountAliases,
	SchemaAccountAliasState,
	SchemaAccountEvents,
} from '../src/db/schema';
import {
	recordAccountEvent,
	SYSTEM_ACTOR,
} from '../src/services/account-events.service';
import { listAccounts } from '../src/services/accounts.service';
import {
	listRemovedAccounts,
	networksWithDifferentSigners,
} from '../src/services/signers.service';
import {
	buildAdd,
	buildEnable,
	buildRemove,
} from '../src/utils/aliases';
import {
	ApiTestFramework,
	newUser,
	refusal,
	sign,
	type TestUser,
} from './framework/api-test-framework';
import { setAliases } from './setup/acting-sets';
import { readObjects, serving } from './setup/alias-reader';
import {
	expectSuccess,
	multisigSigner,
	run,
} from './setup/localnet-transactions';
import { rpcCalls } from './setup/rpc-calls';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();
setDefaultTimeout(60_000);

let framework: ApiTestFramework;

beforeEach(async () => {
	framework = new ApiTestFramework(await createTestApp());
});

// A session signed in as `users`, with its `/v1` client.
const signIn = async (...users: TestUser[]) => {
	const session = framework.createSession();
	for (const user of users) await session.connectUser(user);
	return { session, client: session.v1 };
};

const answer = async (
	user: TestUser,
	account: string,
	given: 'accept' | 'reject',
) => {
	const expiry = defaultExpiry();
	const signature = await sign(
		user,
		given === 'accept'
			? PersonalMessages.acceptAccountInvitation(
					account,
					expiry,
				)
			: PersonalMessages.rejectAccountInvitation(
					account,
					expiry,
				),
	);
	const client = framework.createSession().v1;
	return given === 'accept'
		? client.acceptAccountInvite(account, {
				network: 'localnet',
				signature,
				expiry,
			})
		: client.rejectAccountInvite(account, {
				network: 'localnet',
				signature,
				expiry,
			});
};

const changeProposer = async (
	change: 'add' | 'remove',
	user: TestUser,
	account: string,
	proposer: string,
) => {
	const expiry = defaultExpiry();
	const signature = await sign(
		user,
		change === 'add'
			? PersonalMessages.addMultisigProposer(
					proposer,
					account,
					expiry,
				)
			: PersonalMessages.removeMultisigProposer(
					proposer,
					account,
					expiry,
				),
	);
	const client = framework.createSession().v1;
	const body = {
		network: 'localnet' as const,
		proposer,
		signature,
		expiry,
	};
	return change === 'add'
		? client.addAccountProposer(account, body)
		: client.removeAccountProposer(account, body);
};

const addresses = (accounts: { address: string }[]) =>
	accounts.map((account) => account.address);

describe('GET /v1/accounts', () => {
	test('lists an accepted account with its original set, acting sets, answers and labels, and leaves out an invitation', async () => {
		const [k1, k2, k3] = [newUser(), newUser(), newUser()];
		const { session, client } = await signIn(k1);
		const account = await session.createMultisig(
			[k1, k2, k3],
			2,
			{ name: 'Treasury', labels: ['One', 'Two', null] },
		);
		await session.acceptMultisig(k2, account.address);
		await session.rejectMultisig(k3, account.address);
		const stranger = newUser();
		const invitedTo = await (
			await signIn(stranger)
		).session.createMultisig([stranger, k1], 1);

		const list = await client.getAccounts('localnet');

		const members = [
			{
				user: k1,
				answer: 'accepted' as const,
				label: 'One',
			},
			{
				user: k2,
				answer: 'accepted' as const,
				label: 'Two',
			},
			{
				user: k3,
				answer: 'rejected' as const,
				label: null,
			},
		].map(({ user, answer, label }, order) => ({
			publicKey: user.publicKey,
			weight: 1,
			order,
			answer,
			label,
		}));
		const set = {
			address: account.address,
			threshold: 2,
			members,
		};
		expect(list).toEqual({
			network: 'localnet',
			accounts: [
				{
					address: account.address,
					name: 'Treasury',
					createdBy: k1.address,
					createdAt: expect.any(String),
					originalSignerSet: set,
					signerSets: [{ kind: 'signer_set', ...set }],
					otherSignerSets: [],
					signersChecked: true,
				},
			],
			removed: [],
		});
		expect(addresses(list.accounts)).not.toContain(
			invitedTo.address,
		);
		expect(
			await refusal(client.getAccounts('testnet')),
		).toEqual({
			status: 400,
			message:
				'Unsupported network: testnet. Only localnet are supported.',
		});
	});

	test('an account that holds two of the caller’s keys is listed once', async () => {
		const [k1, k2, stranger] = [
			newUser(),
			newUser(),
			newUser(),
		];
		const account = (
			await (
				await signIn(stranger)
			).session.createMultisig([stranger, k1, k2], 3)
		).address;
		const { client } = await signIn(k1, k2);

		expect(
			addresses(
				(await client.getInvitations('localnet'))
					.invitations,
			),
		).toEqual([account]);

		await answer(k1, account, 'accept');
		await answer(k2, account, 'accept');
		expect(
			addresses(
				(await client.getAccounts('localnet')).accounts,
			),
		).toEqual([account]);
	});

	test('a removal is not reported while another acting set still holds the key', async () => {
		const key = newUser();
		const { session } = await signIn(key);
		const account = (
			await session.createMultisig([key, newUser()], 1)
		).address;
		const composition = (
			await session.createMultisig([key, newUser()], 1)
		).address;
		await setAliases(account, 'localnet', [composition]);
		const eventId = await db.transaction((tx) =>
			recordAccountEvent(tx, {
				action: 'alias.removed',
				accountAddress: account,
				actor: SYSTEM_ACTOR,
				subject: account,
				network: 'localnet',
				proof: {
					kind: 'chain',
					digest: 'unread',
					objectVersion: '2',
				},
			}),
		);
		const removed = () =>
			listRemovedAccounts([key.publicKey], 'localnet');

		expect(await removed()).toEqual([]);

		await db
			.delete(SchemaAccountAliases)
			.where(
				eq(SchemaAccountAliases.accountAddress, account),
			);
		await setAliases(account, 'localnet', [
			newUser().address,
		]);
		expect(await removed()).toEqual([
			{
				accountAddress: account,
				accountName: null,
				publicKey: key.publicKey,
				signerSetAddress: account,
				eventId,
				removedAt: expect.any(Date),
			},
		]);
	});

	test('51 accounts cost two chain reads, and a second list right after costs none', async () => {
		const [a, b] = [newUser(), newUser()];
		const { session, client } = await signIn(a, b);
		for (let i = 0; i < 51; i++)
			await session.createMultisig(
				[i % 2 === 0 ? a : b, newUser()],
				1,
			);

		const before = await rpcCalls('getObjects');
		const list = await client.getAccounts('localnet');
		const first = (await rpcCalls('getObjects')) - before;
		await client.getAccounts('localnet');
		const second =
			(await rpcCalls('getObjects')) - before - first;

		expect(list.accounts).toHaveLength(51);
		expect(first).toBe(2);
		expect(second).toBe(0);
	});

	test('a failed alias read marks only its account as not checked', async () => {
		const key = newUser();
		const { session } = await signIn(key);
		const [failing, healthy] = [
			await session.createMultisig([key, newUser()], 1),
			await session.createMultisig([key, newUser()], 1),
		];
		const { loaders } = serving(async (objectIds) => {
			const response = await readObjects(objectIds);
			return {
				objects: response.objects.map((entry, i) =>
					objectIds[i] ===
					deriveAliasesObjectId(failing.address)
						? new Error('object unreadable')
						: entry,
				),
			};
		});

		const { accounts } = await listAccounts({
			callerKeys: [key.keypair.getPublicKey()],
			network: 'localnet',
			loaders,
		});

		expect(
			Object.fromEntries(
				accounts.map((account) => [
					account.signerSet.address,
					account.signersChecked,
				]),
			),
		).toEqual({
			[failing.address]: false,
			[healthy.address]: true,
		});
	});

	test('a key removed from an account on chain sees it under removed, with no transaction', async () => {
		const { users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const account = multisig.address;
		const signer = multisigSigner(
			'A',
			users.map((user) => user.keypair),
			2,
		);
		const other = newUser().address;
		for (const fill of [
			buildEnable,
			(tx: Parameters<typeof buildEnable>[0]) =>
				buildAdd(tx, { account, alias: other }),
			(tx: Parameters<typeof buildEnable>[0]) =>
				buildRemove(tx, { account, alias: account }),
		])
			expectSuccess(await run(account, signer, fill));

		const list = await (
			await signIn(users[0])
		).client.getAccounts('localnet');

		const [removal] = await db
			.select({
				id: SchemaAccountEvents.id,
				createdAt: SchemaAccountEvents.createdAt,
			})
			.from(SchemaAccountEvents)
			.where(
				and(
					eq(SchemaAccountEvents.accountAddress, account),
					eq(SchemaAccountEvents.action, 'alias.removed'),
				),
			);
		expect(list.accounts).toEqual([]);
		expect(list.removed).toEqual([
			{
				address: account,
				name: null,
				publicKey: users[0].publicKey,
				signerSetAddress: account,
				eventId: removal.id,
				removedAt: removal.createdAt.toISOString(),
			},
		]);
	});
});

describe('POST /v1/accounts/:address/accept and /reject', () => {
	test('write account rows that verify, and an answer of the original set is visible to the legacy routes', async () => {
		const [k1, k2, k3] = [newUser(), newUser(), newUser()];
		const { session } = await signIn(k1);
		const account = (
			await session.createMultisig([k1, k2, k3], 2)
		).address;

		expect(await answer(k2, account, 'accept')).toEqual({
			accountAddress: account,
			publicKey: k2.publicKey,
			answer: 'accepted',
		});
		await answer(k3, account, 'reject');

		const legacy =
			await session.client.getMultisig(account);
		expect(
			legacy.members.map((member) => [
				member.isAccepted,
				member.isRejected,
			]),
		).toEqual([
			[true, false],
			[true, false],
			[false, true],
		]);

		const rows = await db
			.select()
			.from(SchemaAccountEvents)
			.where(
				and(
					eq(SchemaAccountEvents.accountAddress, account),
					inArray(SchemaAccountEvents.action, [
						'account.accepted',
						'account.rejected',
					]),
				),
			)
			.orderBy(asc(SchemaAccountEvents.id));
		const events = rows.map((row) => ({
			id: row.id,
			action: row.action,
			actor: row.actor,
			subject: row.subject,
			proof: row.proof as Record<string, unknown>,
			createdAt: row.createdAt.toISOString(),
		}));
		expect(
			events.map(({ action, actor }) => ({
				action,
				actor,
			})),
		).toEqual([
			{ action: 'account.accepted', actor: k2.address },
			{ action: 'account.rejected', actor: k3.address },
		]);

		for (const event of events)
			expect(
				(
					await verifyAccountEvent(event, {
						accountAddress: account,
						members: [],
					})
				).status,
			).toBe('verified');
	});

	test('a key in no acting set is refused, and nothing is recorded', async () => {
		const k1 = newUser();
		const { session } = await signIn(k1);
		const account = (
			await session.createMultisig([k1, newUser()], 2)
		).address;

		expect(
			await refusal(answer(newUser(), account, 'accept')),
		).toEqual({
			status: 403,
			message:
				'You are not a signer of this account on this network.',
		});
		expect(
			await db
				.select()
				.from(SchemaAccountEvents)
				.where(
					and(
						eq(SchemaAccountEvents.accountAddress, account),
						eq(
							SchemaAccountEvents.action,
							'account.accepted',
						),
					),
				),
		).toEqual([]);
	});

	test('a key of a composition added to another account answers for that account only', async () => {
		const [s1, s2] = [newUser(), newUser()];
		const own = await signIn(s1, s2);
		const composition = (
			await own.session.createMultisig([s1, s2], 2)
		).address;
		const stranger = newUser();
		const account = (
			await (
				await signIn(stranger)
			).session.createMultisig([stranger, newUser()], 2)
		).address;
		await setAliases(account, 'localnet', [
			account,
			composition,
		]);
		const first = await signIn(s1);
		const second = await signIn(s2);

		await answer(s1, account, 'accept');

		expect(
			addresses(
				(await first.client.getAccounts('localnet'))
					.accounts,
			),
		).toEqual([account, composition].sort());
		expect(
			await db
				.select({
					isAccepted: SchemaAccountAcceptances.isAccepted,
				})
				.from(SchemaAccountAcceptances)
				.where(
					and(
						eq(
							SchemaAccountAcceptances.accountAddress,
							account,
						),
						eq(
							SchemaAccountAcceptances.publicKey,
							s1.publicKey,
						),
					),
				),
		).toEqual([{ isAccepted: true }]);
		expect(
			addresses(
				(await second.client.getAccounts('localnet'))
					.accounts,
			),
		).toEqual([composition]);
		expect(
			addresses(
				(await second.client.getInvitations('localnet'))
					.invitations,
			),
		).toEqual([account]);
	});
});

describe('GET /v1/accounts/:address', () => {
	test('returns the original and acting sets with labels, whether changes are allowed, and the proposers with their events, also to an invited key', async () => {
		const [k1, k2] = [newUser(), newUser()];
		const { session, client } = await signIn(k1);
		const account = (
			await session.createMultisig([k1, k2], 2, {
				name: 'Treasury',
				labels: ['Main', 'Backup'],
			})
		).address;
		const proposer = newUser().address;
		await session.addProposer(k1, proposer, account);
		const invited = await signIn(k2);

		const before = await client.getAccount(
			account,
			'localnet',
		);
		// `enable` alone: the object exists and lists only the account.
		await db
			.update(SchemaAccountAliasState)
			.set({ exists: true, observedVersion: 1 })
			.where(
				eq(SchemaAccountAliasState.accountAddress, account),
			);
		const read = await invited.client.getAccount(
			account,
			'localnet',
		);

		const set = {
			address: account,
			threshold: 2,
			members: [
				{
					publicKey: k1.publicKey,
					weight: 1,
					order: 0,
					answer: 'accepted' as const,
					label: 'Main',
				},
				{
					publicKey: k2.publicKey,
					weight: 1,
					order: 1,
					answer: 'invited' as const,
					label: 'Backup',
				},
			],
		};
		expect(before.signerChangesAllowed).toBe(false);
		expect(read).toEqual({
			address: account,
			name: 'Treasury',
			createdBy: k1.address,
			createdAt: expect.any(String),
			originalSignerSet: set,
			signerSets: [{ kind: 'signer_set', ...set }],
			otherSignerSets: [],
			signersChecked: true,
			network: 'localnet',
			signerChangesAllowed: true,
			networksWithDifferentSigners: [],
			proposers: [
				{
					address: proposer,
					addedBy: k1.address,
					addedAt: expect.any(String),
					event: expect.objectContaining({
						action: 'proposer.added',
						actor: k1.address,
						subject: proposer,
					}),
				},
			],
		});
	});

	test('names the other networks whose alias set differs, where an account whose set was removed is not listed', async () => {
		const [k1, k2] = [newUser(), newUser()];
		const { session } = await signIn(k1, k2);
		const account = (
			await session.createMultisig([k1, k2], 2)
		).address;
		const replacement = (
			await session.createMultisig([k1, newUser()], 2)
		).address;
		const networks = ['localnet', 'testnet'] as const;
		const differ = () =>
			networksWithDifferentSigners(account, 'localnet', [
				...networks,
			]);
		const listed = async (
			network: (typeof networks)[number],
		) =>
			(
				await listAccounts({
					callerKeys: [k2.keypair.getPublicKey()],
					network,
				})
			).accounts.map((a) => a.signerSet.address);

		await setAliases(account, 'testnet', [account]);
		expect(await differ()).toEqual([]);

		await db
			.delete(SchemaAccountAliases)
			.where(
				eq(SchemaAccountAliases.accountAddress, account),
			);
		await setAliases(account, 'testnet', [replacement]);
		expect(await differ()).toEqual(['testnet']);
		expect(await listed('localnet')).toContain(account);
		expect(await listed('testnet')).not.toContain(account);
	});
});

describe('POST and DELETE /v1/accounts/:address/proposers', () => {
	test('add and remove a proposer', async () => {
		const { session, users, multisig } =
			await framework.createVerifiedMultisig(2, 2);
		const proposer = newUser().address;
		const proposers = async () =>
			(
				await session.v1.getAccount(
					multisig.address,
					'localnet',
				)
			).proposers.map((entry) => entry.address);

		expect(
			await changeProposer(
				'add',
				users[0],
				multisig.address,
				proposer,
			),
		).toEqual({ success: true });
		expect(await proposers()).toEqual([proposer]);

		await changeProposer(
			'remove',
			users[1],
			multisig.address,
			proposer,
		);
		expect(await proposers()).toEqual([]);
	});
});
