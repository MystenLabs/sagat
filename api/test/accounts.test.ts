// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { defaultExpiry } from '@mysten/sagat';
import { PersonalMessages as LegacyMessages } from '@mysten/sagat-legacy';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import { LIMITS } from '../src/constants/limits';
import { AuthErrors } from '../src/errors';
import {
	ApiTestFramework,
	failureOf,
	newUser,
	NOT_A_MEMBER,
	sign,
	type TestUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';

setupSharedTestEnvironment();

const addresses = (accounts: { address: string }[]) =>
	accounts.map((a) => a.address);

describe('Accounts API', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	describe('listing', () => {
		test('lists each account the session can sign for once, however many of its keys are in it', async () => {
			const { session, account } =
				await framework.createVerifiedAccount(3, 2);

			const accounts = await session.v1.getAccounts();
			expect(addresses(accounts)).toEqual([
				account.address,
			]);
			expect(accounts[0]).toEqual(account);
		});

		test('lists the accounts of every key in the session, oldest first', async () => {
			const session = framework.createSession();
			const [alice, bob, carol] = [
				newUser(),
				newUser(),
				newUser(),
			];
			await session.connectUser(alice);
			const first = await session.createSignerSet(
				[alice, carol],
				1,
			);
			await session.connectUser(bob);
			const second = await session.createSignerSet(
				[bob, carol],
				1,
			);

			expect(
				addresses(await session.v1.getAccounts()),
			).toEqual([first.address, second.address]);
		});

		test('leaves out invitations that are not accepted, and rejected ones', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(1);
			const invitee = newUser();
			const pending = await session.createSignerSet(
				[users[0], newUser()],
				2,
			);
			const rejected = await session.createSignerSet(
				[users[0], invitee],
				2,
			);
			await session.rejectSignerSet(
				invitee,
				rejected.address,
			);

			// The creator accepted both on creation.
			expect(
				addresses(await session.v1.getAccounts()),
			).toEqual([pending.address, rejected.address]);

			const inviteeSession = framework.createSession();
			await inviteeSession.connectUser(invitee);
			expect(await inviteeSession.v1.getAccounts()).toEqual(
				[],
			);

			const outsider = framework.createSession();
			await outsider.connectUser(newUser());
			expect(await outsider.v1.getAccounts()).toEqual([]);
		});

		test('needs a session', async () => {
			await expect(
				framework.createSession().v1.getAccounts(),
			).rejects.toMatchObject({ status: 401 });
		});
	});

	describe('proposers', () => {
		test('are added and removed with the account messages, and listed on the account', async () => {
			const { session, users, account } =
				await framework.createVerifiedAccount(2, 2);
			const proposer = newUser().address;

			expect(
				await session.addAccountProposer(
					users[0],
					proposer,
					account.address,
				),
			).toEqual({ success: true });

			const { proposers } = await session.v1.getAccount(
				account.address,
			);
			expect(proposers).toEqual([
				{
					accountAddress: account.address,
					address: proposer,
					addedBy: users[0].address,
					addedAt: expect.any(String),
				},
			]);

			expect(
				await session.removeAccountProposer(
					users[1],
					proposer,
					account.address,
				),
			).toEqual({ success: true });
			expect(
				(await session.v1.getAccount(account.address))
					.proposers,
			).toEqual([]);
		});

		test('changing proposers needs no session, only the signature', async () => {
			const { users, account } =
				await framework.createVerifiedAccount(2, 2);
			const anonymous = framework.createSession();
			const proposer = newUser().address;

			expect(
				await anonymous.addAccountProposer(
					users[0],
					proposer,
					account.address,
				),
			).toEqual({ success: true });
			// A wrong signer is still refused.
			await expect(
				anonymous.addAccountProposer(
					newUser(),
					newUser().address,
					account.address,
				),
			).rejects.toMatchObject(NOT_A_MEMBER);
			await expect(
				anonymous.removeAccountProposer(
					newUser(),
					proposer,
					account.address,
				),
			).rejects.toMatchObject(NOT_A_MEMBER);

			expect(
				await anonymous.removeAccountProposer(
					users[1],
					proposer,
					account.address,
				),
			).toEqual({ success: true });
		});

		test('the legacy multisig messages are refused', async () => {
			const { session, users, account } =
				await framework.createVerifiedAccount(2, 2);
			const proposer = newUser().address;
			const expiry = defaultExpiry();

			await expect(
				session.v1.addAccountProposer(
					account.address,
					proposer,
					await sign(
						users[0],
						LegacyMessages.addMultisigProposer(
							proposer,
							account.address,
							expiry,
						),
					),
					expiry,
				),
			).rejects.toMatchObject({
				status: 400,
				message: 'Invalid signature for message.',
			});

			await session.addAccountProposer(
				users[0],
				proposer,
				account.address,
			);
			await expect(
				session.v1.removeAccountProposer(
					account.address,
					proposer,
					await sign(
						users[0],
						LegacyMessages.removeMultisigProposer(
							proposer,
							account.address,
							expiry,
						),
					),
					expiry,
				),
			).rejects.toMatchObject({
				status: 400,
				message: 'Invalid signature for message.',
			});
		});

		test('only members can add proposers', async () => {
			const { session, account } =
				await framework.createVerifiedAccount(2, 2);
			const outsider = newUser();

			await expect(
				session.addAccountProposer(
					outsider,
					outsider.address,
					account.address,
				),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);
		});

		test('an expired signature is refused', async () => {
			const { session, users, account } =
				await framework.createVerifiedAccount(2, 2);

			await expect(
				session.addAccountProposer(
					users[0],
					newUser().address,
					account.address,
					{ expiry: '2021-01-01' },
				),
			).rejects.toThrow('Signature has expired');
		});

		// Status, body and check order of the error responses, locked so
		// that a refactor of the flows cannot change them unnoticed. A
		// malformed address never reaches the flow: the request schema
		// refuses it first.
		describe('error responses', () => {
			test('adding checks the address, then the expiry, then membership, then the signature', async () => {
				const { session, users, account } =
					await framework.createVerifiedAccount(2, 2);
				const outsider = newUser();
				const add = (
					signer: TestUser,
					proposer: string,
					options?: {
						expiry?: string;
						signedExpiry?: string;
					},
				) =>
					failureOf(
						session.addAccountProposer(
							signer,
							proposer,
							account.address,
							options,
						),
					);

				expect(
					await add(outsider, 'not-an-address', {
						expiry: 'not-a-date',
					}),
				).toEqual({
					status: 400,
					message: 'proposer: Must be a valid Sui address.',
				});
				expect(
					await add(outsider, newUser().address, {
						expiry: 'not-a-date',
					}),
				).toEqual({
					status: 400,
					message: 'Invalid expiry date format',
				});
				expect(
					await add(outsider, newUser().address, {
						expiry: '2021-01-01',
					}),
				).toEqual({
					status: 400,
					message: 'Signature has expired',
				});
				expect(
					await add(outsider, newUser().address),
				).toEqual(NOT_A_MEMBER);
				expect(
					await add(users[0], newUser().address, {
						signedExpiry: new Date(
							Date.now() + 60_000,
						).toISOString(),
					}),
				).toEqual({
					status: 400,
					message: 'Invalid signature for message.',
				});
			});

			test('adding refuses a proposer that is already there', async () => {
				const { session, users, account } =
					await framework.createVerifiedAccount(2, 2);
				const proposer = newUser().address;
				await session.addAccountProposer(
					users[0],
					proposer,
					account.address,
				);

				expect(
					await failureOf(
						session.addAccountProposer(
							users[1],
							proposer,
							account.address,
						),
					),
				).toEqual({
					status: 400,
					message: `${proposer} is already a proposer for this multisig`,
				});
			});

			test('adding checks the proposer limit before duplicates', async () => {
				const { session, users, account } =
					await framework.createVerifiedAccount(2, 2);
				const proposers = Array.from(
					{ length: LIMITS.maxProposersPerMultisig },
					() => newUser().address,
				);
				for (const proposer of proposers)
					await session.addAccountProposer(
						users[0],
						proposer,
						account.address,
					);

				const limitReached = {
					status: 400,
					message:
						'You have reached the maximum number of proposers for this multisig',
				};
				expect(
					await failureOf(
						session.addAccountProposer(
							users[0],
							newUser().address,
							account.address,
						),
					),
				).toEqual(limitReached);
				// At the limit, even a proposer that is already there gets the
				// limit error, not the duplicate one.
				expect(
					await failureOf(
						session.addAccountProposer(
							users[0],
							proposers[0],
							account.address,
						),
					),
				).toEqual(limitReached);
			});

			test('removing checks the address, then the expiry, then membership', async () => {
				const { session, account } =
					await framework.createVerifiedAccount(2, 2);
				const outsider = newUser();

				expect(
					await failureOf(
						session.removeAccountProposer(
							outsider,
							'not-an-address',
							account.address,
							{ expiry: '2021-01-01' },
						),
					),
				).toEqual({
					status: 400,
					message: 'proposer: Must be a valid Sui address.',
				});
				expect(
					await failureOf(
						session.removeAccountProposer(
							outsider,
							newUser().address,
							account.address,
							{ expiry: '2021-01-01' },
						),
					),
				).toEqual({
					status: 400,
					message: 'Signature has expired',
				});
				expect(
					await failureOf(
						session.removeAccountProposer(
							outsider,
							newUser().address,
							account.address,
						),
					),
				).toEqual(NOT_A_MEMBER);
			});
		});
	});
});
