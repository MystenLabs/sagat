// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

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
	answerFor,
	register,
	setAliases,
} from './setup/acting-sets';
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
		expect(
			signers.actingSets.filter(
				(s) => s.address === account,
			),
		).toHaveLength(1);
		expect(signers.originalSet).toEqual(
			(await resolveAccountSigners(account, ORIGINAL_SET))!
				.originalSet,
		);
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

	test('listActingAccounts proposes exactly the (account, key) pairs the resolver gives', async () => {
		const shared = newUser();
		const [a1, a2, a3] = [newUser(), newUser(), newUser()];
		const plain = await createAccount(
			[a1, shared],
			[a2, a3],
		);
		await session.rejectMultisig(a3, plain);

		const [c1, c2] = [newUser(), newUser()];
		const composition = await createAccount(
			[c1],
			[c2, shared],
			1,
		);
		const [b1, b2] = [newUser(), newUser()];
		const withOwn = await createAccount(
			[b1],
			[b2, shared],
			1,
		);
		await setAliases(withOwn, 'localnet', [
			withOwn,
			composition,
		]);
		await answerFor(withOwn, c2, 'rejected');

		const key = newUser();
		await register(key);
		const withoutOwn = await createAccount([
			newUser(),
			newUser(),
		]);
		await setAliases(withoutOwn, 'localnet', [
			composition,
			key.address,
			newUser().address,
		]);
		await setAliases(withoutOwn, 'testnet', [composition]);
		await answerFor(withoutOwn, key, 'accepted');
		await answerFor(withoutOwn, c1, 'accepted');

		const accounts = [
			plain,
			composition,
			withOwn,
			withoutOwn,
		];
		const allKeys = [
			shared,
			a1,
			a2,
			a3,
			c1,
			c2,
			b1,
			b2,
			key,
		].map((user) => user.publicKey);
		const pairs = (
			rows: { accountAddress: string; publicKey: string }[],
		) =>
			rows
				.map(
					(row) => `${row.accountAddress} ${row.publicKey}`,
				)
				.sort();

		for (const network of [
			'localnet',
			'testnet',
		] as const) {
			const resolved = await resolveSigners(
				accounts,
				actingSetsOn(network),
			);
			for (const answer of [
				'accepted',
				'invited',
				'rejected',
			] as const) {
				// A key in two sets of one account is one pair.
				const expected = [
					...new Set(
						pairs(
							[...resolved.values()].flatMap((signers) =>
								signers.actingSets.flatMap((set) =>
									set.members
										.filter(
											(member) => member.answer === answer,
										)
										.map((member) => ({
											accountAddress:
												signers.accountAddress,
											publicKey: member.publicKey,
										})),
								),
							),
						),
					),
				];
				expect(expected.length).toBeGreaterThan(0);
				expect(
					pairs(
						await listActingAccounts(
							allKeys,
							network,
							answer,
						),
					),
				).toEqual(expected);
			}
		}
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

		expect(await statementsFor(accounts.slice(0, 1))).toBe(
			1,
		);
		expect(await statementsFor(accounts)).toBe(1);
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
