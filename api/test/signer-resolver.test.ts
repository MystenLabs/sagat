// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db';
import {
	SchemaAccountAcceptances,
	SchemaAccountAliases,
	SchemaAccountAliasState,
	SchemaAddresses,
} from '../src/db/schema';
import {
	actingSetsOn,
	countSignatures,
	keyAnswer,
	listActingAccounts,
	ORIGINAL_SET,
	resolveAccountSigners,
	resolveSigners,
	type ActingSignerSet,
	type KeyAnswer,
} from '../src/services/signers.service';
import { type SuiNetwork } from '../src/utils/client';
import {
	ApiTestFramework,
	newUser,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import { queryCount } from './setup/test-db';

setupSharedTestEnvironment();

const LOCALNET = actingSetsOn('localnet');
const TESTNET = actingSetsOn('testnet');

let framework: ApiTestFramework;
let session: TestSession;

beforeEach(async () => {
	framework = new ApiTestFramework(await createTestApp());
	session = framework.createSession();
});

// An account whose `invited` members are not connected, so they have not accepted.
const createAccount = async (
	accepted: TestUser[],
	invited: TestUser[] = [],
	threshold = accepted.length + invited.length,
) => {
	for (const user of accepted)
		await session.connectUser(user);
	const multisig = await session.createMultisig(
		[...accepted, ...invited],
		threshold,
	);
	return multisig.address;
};

const setAliases = async (
	account: string,
	network: SuiNetwork,
	aliases: string[],
) => {
	await db
		.insert(SchemaAccountAliasState)
		.values({
			accountAddress: account,
			network,
			exists: true,
			observedVersion: 1,
			observedAt: new Date(),
		})
		.onConflictDoNothing();
	await db.insert(SchemaAccountAliases).values(
		aliases.map((aliasAddress) => ({
			accountAddress: account,
			network,
			aliasAddress,
		})),
	);
};

const answerFor = (
	account: string,
	user: TestUser,
	answer: 'accepted' | 'rejected',
) =>
	db.insert(SchemaAccountAcceptances).values({
		accountAddress: account,
		publicKey: user.publicKey,
		isAccepted: answer === 'accepted',
		isRejected: answer === 'rejected',
	});

const register = (user: TestUser) =>
	db
		.insert(SchemaAddresses)
		.values({
			publicKey: user.publicKey,
			address: user.address,
		})
		.onConflictDoNothing();

const membersOf = (set: ActingSignerSet) =>
	set.members.map((m) => [m.publicKey, m.answer]);

const answerOf = async (
	account: string,
	user: TestUser,
	network: SuiNetwork = 'localnet',
): Promise<KeyAnswer | null> =>
	keyAnswer(
		(await resolveAccountSigners(
			account,
			actingSetsOn(network),
		))!,
		user.publicKey,
	);

describe('signer resolver', () => {
	test('an account with no mirror rows has its original set acting on every network', async () => {
		const users = [newUser(), newUser()];
		const account = await createAccount(users);

		for (const scope of [LOCALNET, TESTNET]) {
			const signers = (await resolveAccountSigners(
				account,
				scope,
			))!;
			expect(signers.originalSet!.address).toBe(account);
			expect(signers.otherSignerSets).toEqual([]);
			expect(signers.actingSets).toEqual([
				{
					kind: 'signer_set',
					address: account,
					threshold: 2,
					members: users.map((user, order) => ({
						publicKey: user.publicKey,
						weight: 1,
						order,
						answer: 'accepted',
					})),
				},
			]);
		}
	});

	test('classifies each alias: a known composition and a registered key act, an unknown address does not', async () => {
		const owners = [newUser(), newUser()];
		const account = await createAccount(owners);
		const signers = [newUser(), newUser()];
		const composition = await createAccount(signers, [], 1);
		const key = newUser();
		await register(key);
		const unknown = newUser().address;
		await setAliases(account, 'localnet', [
			composition,
			key.address,
			unknown,
		]);

		const resolved = (await resolveAccountSigners(
			account,
			LOCALNET,
		))!;

		expect(resolved.originalSet!.address).toBe(account);
		expect(resolved.otherSignerSets).toEqual([unknown]);
		expect(resolved.actingSets).toEqual(
			[
				{
					kind: 'signer_set' as const,
					address: composition,
					threshold: 1,
					members: signers.map((user, order) => ({
						publicKey: user.publicKey,
						weight: 1,
						order,
						answer: 'invited' as const,
					})),
				},
				{
					kind: 'key' as const,
					address: key.address,
					threshold: 1,
					members: [
						{
							publicKey: key.publicKey,
							weight: 1,
							order: 0,
							answer: 'invited' as const,
						},
					],
				},
			].sort((a, b) => (a.address < b.address ? -1 : 1)),
		);
		expect(keyAnswer(resolved, owners[0].publicKey)).toBe(
			null,
		);
	});

	test('aliases on one network leave the original set acting on another', async () => {
		const owners = [newUser(), newUser()];
		const account = await createAccount(owners);
		const other = await createAccount([
			newUser(),
			newUser(),
		]);
		await setAliases(account, 'localnet', [other]);

		expect(
			(await resolveAccountSigners(
				account,
				LOCALNET,
			))!.actingSets.map((s) => s.address),
		).toEqual([other]);
		expect(
			(await resolveAccountSigners(
				account,
				TESTNET,
			))!.actingSets.map((s) => s.address),
		).toEqual([account]);
	});

	test('an account whose only alias is unknown has no acting set on that network', async () => {
		const account = await createAccount([
			newUser(),
			newUser(),
		]);
		const unknown = newUser().address;
		await setAliases(account, 'testnet', [unknown]);

		const onTestnet = (await resolveAccountSigners(
			account,
			TESTNET,
		))!;
		expect(onTestnet.actingSets).toEqual([]);
		expect(onTestnet.otherSignerSets).toEqual([unknown]);
		expect(
			(await resolveAccountSigners(
				account,
				LOCALNET,
			))!.actingSets.map((s) => s.address),
		).toEqual([account]);
	});

	test('a key answers for an account, from its member row or its acceptance row', async () => {
		const [accepted, invited, rejected] = [
			newUser(),
			newUser(),
			newUser(),
		];
		const account = await createAccount(
			[accepted],
			[invited, rejected],
			1,
		);
		await session.rejectMultisig(rejected, account);

		const members = [newUser(), newUser(), newUser()];
		const composition = await createAccount(members, [], 1);
		const neighbour = await createAccount([
			newUser(),
			newUser(),
		]);
		await setAliases(account, 'localnet', [
			account,
			composition,
		]);
		await setAliases(neighbour, 'localnet', [composition]);
		await answerFor(account, members[1], 'accepted');
		await answerFor(account, members[2], 'rejected');

		const signers = (await resolveAccountSigners(
			account,
			LOCALNET,
		))!;
		const byAddress = new Map(
			signers.actingSets.map((s) => [s.address, s]),
		);
		expect(membersOf(byAddress.get(account)!)).toEqual([
			[accepted.publicKey, 'accepted'],
			[invited.publicKey, 'invited'],
			[rejected.publicKey, 'rejected'],
		]);
		expect(membersOf(byAddress.get(composition)!)).toEqual([
			[members[0].publicKey, 'invited'],
			[members[1].publicKey, 'accepted'],
			[members[2].publicKey, 'rejected'],
		]);

		expect(await answerOf(neighbour, members[1])).toBe(
			'invited',
		);
	});

	test('a removed set that is added back keeps its earlier answer', async () => {
		const account = await createAccount([
			newUser(),
			newUser(),
		]);
		const member = newUser();
		const composition = await createAccount([
			member,
			newUser(),
		]);
		await setAliases(account, 'localnet', [
			account,
			composition,
		]);
		await answerFor(account, member, 'accepted');

		const row = and(
			eq(SchemaAccountAliases.accountAddress, account),
			eq(SchemaAccountAliases.aliasAddress, composition),
		);
		await db.delete(SchemaAccountAliases).where(row);
		expect(await answerOf(account, member)).toBe(null);

		await setAliases(account, 'localnet', [composition]);
		expect(await answerOf(account, member)).toBe(
			'accepted',
		);
	});

	test('a stranger listing a known composition invites its members but is not their account', async () => {
		const members = [newUser(), newUser()];
		const own = await createAccount(members);
		const stranger = await createAccount([
			newUser(),
			newUser(),
		]);
		await setAliases(stranger, 'localnet', [own]);

		const signers = (await resolveAccountSigners(
			stranger,
			LOCALNET,
		))!;
		expect(membersOf(signers.actingSets[0])).toEqual(
			members.map((m) => [m.publicKey, 'invited']),
		);

		expect(
			await listActingAccounts(
				[members[0].publicKey],
				'localnet',
				'accepted',
			),
		).toEqual([
			{
				accountAddress: own,
				publicKey: members[0].publicKey,
			},
		]);
		expect(
			await listActingAccounts(
				[members[0].publicKey],
				'localnet',
				'invited',
			),
		).toEqual([
			{
				accountAddress: stranger,
				publicKey: members[0].publicKey,
			},
		]);
	});

	test('listActingAccounts follows each network, and a key alias once it accepted', async () => {
		const owner = newUser();
		const account = await createAccount([owner, newUser()]);
		const key = newUser();
		await register(key);
		await setAliases(account, 'localnet', [key.address]);

		expect(
			await listActingAccounts(
				[key.publicKey],
				'localnet',
				'accepted',
			),
		).toEqual([]);
		await answerFor(account, key, 'accepted');
		expect(
			await listActingAccounts(
				[key.publicKey],
				'localnet',
				'accepted',
			),
		).toEqual([
			{ accountAddress: account, publicKey: key.publicKey },
		]);

		expect(
			await listActingAccounts(
				[owner.publicKey],
				'localnet',
				'accepted',
			),
		).toEqual([]);
		expect(
			await listActingAccounts(
				[owner.publicKey],
				'testnet',
				'accepted',
			),
		).toEqual([
			{
				accountAddress: account,
				publicKey: owner.publicKey,
			},
		]);
	});

	test('countSignatures counts a key in every set that holds it, ready when any set reaches its threshold', () => {
		const member = (publicKey: string, order: number) => ({
			publicKey,
			weight: 1,
			order,
			answer: 'accepted' as const,
		});
		const first: ActingSignerSet = {
			kind: 'signer_set',
			address: '0x1',
			threshold: 2,
			members: [member('a', 0), member('b', 1)],
		};
		const second: ActingSignerSet = {
			kind: 'signer_set',
			address: '0x2',
			threshold: 2,
			members: [member('b', 0), member('c', 1)],
		};

		const shared = countSignatures([first, second], ['b']);
		expect(shared.sets.map((s) => s.currentWeight)).toEqual(
			[1, 1],
		);
		expect(shared.hasReachedThreshold).toBe(false);

		const ready = countSignatures(
			[first, second],
			['b', 'c'],
		);
		expect(
			ready.sets.map((s) => s.hasReachedThreshold),
		).toEqual([false, true]);
		expect(ready.hasReachedThreshold).toBe(true);

		expect(countSignatures([], ['a'])).toEqual({
			sets: [],
			hasReachedThreshold: false,
		});
	});

	test('the number of statements does not grow with the number of accounts', async () => {
		const accounts: string[] = [];
		for (let i = 0; i < 6; i++)
			accounts.push(
				await createAccount([newUser()], [newUser()], 1),
			);
		await setAliases(accounts[1], 'localnet', [
			accounts[0],
			newUser().address,
		]);

		const statementsFor = async (addresses: string[]) => {
			const before = queryCount();
			const resolved = await resolveSigners(
				addresses,
				LOCALNET,
			);
			expect(resolved.size).toBe(addresses.length);
			return queryCount() - before;
		};

		const one = await statementsFor(accounts.slice(0, 1));
		expect(one).toBeGreaterThan(0);
		expect(await statementsFor(accounts)).toBe(one);
	});

	test('the original scope returns the set at the address, whatever the mirror says', async () => {
		const accepted = newUser();
		const invited = newUser();
		const account = await createAccount(
			[accepted],
			[invited],
			1,
		);
		const other = await createAccount([
			newUser(),
			newUser(),
		]);
		await setAliases(account, 'localnet', [other]);

		const signers = (
			await resolveSigners([account], ORIGINAL_SET)
		).get(account)!;
		expect(signers.originalSet!.address).toBe(account);
		expect(signers.otherSignerSets).toEqual([]);
		expect(
			signers.actingSets.map((s) => s.address),
		).toEqual([account]);
		expect(membersOf(signers.actingSets[0])).toEqual([
			[accepted.publicKey, 'accepted'],
			[invited.publicKey, 'invited'],
		]);
	});
});
