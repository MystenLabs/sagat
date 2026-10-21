// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	PersonalMessages,
	ProposalStatus,
} from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
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
	failureOf,
	newUser,
	NOT_A_MEMBER,
	sendCoins,
	sign,
	signTx,
	type TestUser,
} from './framework/api-test-framework';
import { rpcCalls } from './setup/rpc-calls';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import { getLocalClient } from './setup/sui-network';

const client = getLocalClient();

setupSharedTestEnvironment();

describe('Proposal Business Logic', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	describe('Transaction Validation', () => {
		test('rejects proposal when signature is for a different transaction', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(2, 2);

			const signed = await buildTransfer(account.address, {
				amount: 500_000,
			});
			const submitted = await buildTransfer(
				account.address,
				{ amount: 999_999 },
			);
			const signature = await signTx(users[0], signed);

			await expect(
				session.v1.createProposal({
					accountAddress: account.address,
					network: 'localnet',
					transactionBytes: submitted,
					signature,
				}),
			).rejects.toThrow(/Invalid Sui signature/);
		});

		test('checks the signature before any RPC work', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(2, 2);
			// A pending proposal, whose objects a new one is checked against.
			await session.proposeTransfer(
				users[0],
				account.address,
			);

			const signature = await signTx(
				users[0],
				await buildTransfer(account.address),
			);
			const before = await rpcCalls('getObjects');
			await expect(
				session.v1.createProposal({
					accountAddress: account.address,
					network: 'localnet',
					transactionBytes: await buildTransfer(
						account.address,
						{ amount: 999_999 },
					),
					signature,
				}),
			).rejects.toThrow(/Invalid Sui signature/);
			expect(await rpcCalls('getObjects')).toBe(before);
		});

		test('prevents duplicate proposals with same transaction digest', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(2, 2);

			// Without an expiration, the node picks one with a random nonce
			// when it selects gas, so pin it: the same PTB must then build to
			// the same digest.
			const [{ chainIdentifier }, { systemState }] =
				await Promise.all([
					client.getChainIdentifier(),
					client.getCurrentSystemState(),
				]);
			const epoch = BigInt(systemState.epoch);
			const buildPinnedTransfer = async () => {
				const tx = new Transaction();
				tx.setSender(account.address);
				tx.setExpiration({
					ValidDuring: {
						minEpoch: String(epoch),
						maxEpoch: String(epoch + 1n),
						minTimestamp: null,
						maxTimestamp: null,
						chain: chainIdentifier,
						nonce: 0,
					},
				});
				const [coin] = tx.splitCoins(tx.gas, [1000000]);
				tx.transferObjects([coin], account.address);
				const bytes = (
					await tx.build({ client })
				).toBase64();
				return { bytes, digest: await tx.getDigest() };
			};

			// Build identical transactions
			const tx1 = await buildPinnedTransfer();
			const tx2 = await buildPinnedTransfer();
			expect(tx2.digest).toBe(tx1.digest);

			await session.createProposal(
				users[0],
				account.address,
				'localnet',
				tx1.bytes,
			);

			await expect(
				session.createProposal(
					users[0],
					account.address,
					'localnet',
					tx2.bytes,
				),
			).rejects.toThrow(/same digest/);
		});

		test('verifying a proposal that was never executed is a client error', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(2, 1);

			const proposal = await session.proposeTransfer(
				users[0],
				account.address,
			);

			await expect(
				session.v1.verifyProposalByDigest(proposal.digest),
			).rejects.toThrow(/has not been executed yet/);
		});
	});

	test('weighs votes by member weight', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(3);
		const account = await session.createSignerSet(
			users,
			3,
			{
				weights: [1, 2, 1],
				fund: true,
			},
		);
		await session.acceptSignerSet(
			users[1],
			account.address,
		);

		const proposal = await session.proposeTransfer(
			users[0],
			account.address,
		);

		// 1 + 1 out of 3.
		expect(
			await session.voteOnProposal(users[2], proposal),
		).toEqual({
			hasReachedThreshold: false,
			readySignerSets: [],
		});
		// 1 + 1 + 2 out of 3.
		expect(
			await session.voteOnProposal(users[1], proposal),
		).toEqual({
			hasReachedThreshold: true,
			readySignerSets: [account.address],
		});
	});

	describe('Signer sets on a proposal', () => {
		test('the public proposal tallies each signer set, and has no legacy multisig fields', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(3);
			const account = await session.createSignerSet(
				users,
				3,
				{
					name: 'Treasury',
					weights: [1, 2, 1],
					labels: ["Alice's Ledger", null, null],
					fund: true,
				},
			);
			const proposal = await session.proposeTransfer(
				users[0],
				account.address,
			);

			const anonymous = framework.createSession().v1;
			const byDigest = await anonymous.getProposalByDigest(
				proposal.digest,
			);
			expect(byDigest).toMatchObject({
				...proposal,
				executedVia: null,
				signatures: [{ publicKey: users[0].publicKey }],
				signerSets: [
					{
						address: account.address,
						label: 'Treasury',
						threshold: 3,
						totalWeight: 4,
						currentWeight: 1,
						hasReachedThreshold: false,
						members: users.map((user, order) => ({
							publicKey: user.publicKey,
							weight: [1, 2, 1][order],
							order,
							hasSigned: order === 0,
						})),
					},
				],
			});
			for (const field of [
				'multisig',
				'multisigAddress',
				'currentWeight',
				'totalWeight',
			])
				expect(byDigest).not.toHaveProperty(field);

			await session.voteOnProposal(users[1], proposal);
			const [signerSet] = (
				await anonymous.getProposalByDigest(proposal.digest)
			).signerSets;
			expect(signerSet).toMatchObject({
				currentWeight: 3,
				hasReachedThreshold: true,
			});
			expect(
				signerSet.members.map((m) => m.hasSigned),
			).toEqual([true, true, false]);
		});

		test('a vote returns the signer sets that reached their threshold', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(3, 2);
			const proposal = await session.proposeTransfer(
				users[0],
				account.address,
			);

			expect(
				await session.voteOnProposal(users[1], proposal),
			).toEqual({
				hasReachedThreshold: true,
				readySignerSets: [account.address],
			});
		});

		test('executing with the ready signer set and verifying records the outcome', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(2, 2);
			const proposal = await session.proposeTransfer(
				users[0],
				account.address,
			);

			const tx = await session.voteAndExecute(
				users,
				proposal.digest,
			);
			expect(tx.effects!.status.success).toBe(true);

			const { data } = await session.v1.getProposals(
				account.address,
				'localnet',
				{ status: ProposalStatus.SUCCESS },
			);
			expect(data.map((p) => p.id)).toEqual([proposal.id]);
			// Verifying again is fine: the outcome is already recorded.
			expect(
				await session.v1.verifyProposal(proposal.id),
			).toEqual({ verified: true });
		});
	});

	describe('Vote Validation', () => {
		test('prevents duplicate voting by same member', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(2, 2);

			const proposal = await session.proposeTransfer(
				users[0],
				account.address,
			);

			// The proposer already voted by proposing.
			await expect(
				session.voteOnProposal(users[0], proposal),
			).rejects.toThrow('already voted');
		});

		test('rejects vote when signature is for a different transaction', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(3, 2);

			const proposal = await session.proposeTransfer(
				users[0],
				account.address,
			);
			const signature = await signTx(
				users[1],
				await buildTransfer(account.address, {
					amount: 999_999,
				}),
			);

			await expect(
				session.v1.voteForProposal(proposal.id, {
					signature,
				}),
			).rejects.toThrow(/Invalid Sui signature/);
		});
	});

	describe('Member Access Control', () => {
		test('only members who accepted can propose', async () => {
			const { session, users } =
				await framework.createAuthenticatedSession(1);
			const invitee = newUser();
			const account = await session.createSignerSet(
				[users[0], invitee],
				2,
				{ fund: true },
			);

			await expect(
				session.proposeTransfer(invitee, account.address),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);
		});

		test('non-members cannot propose or vote', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(2, 2);
			const outsider = newUser();

			await expect(
				session.proposeTransfer(outsider, account.address),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);

			const proposal = await session.proposeTransfer(
				users[0],
				account.address,
			);
			await expect(
				session.voteOnProposal(outsider, proposal),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);
		});
	});

	describe('Proposer Access Control', () => {
		test('Add proposer, propose, remove proposer, try to propose and fail', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(2, 2);
			const proposer = newUser();

			await session.addAccountProposer(
				users[0],
				proposer.address,
				account.address,
			);
			await session.proposeTransfer(
				proposer,
				account.address,
			);

			await session.removeAccountProposer(
				users[0],
				proposer.address,
				account.address,
			);

			// Removing the proposer cancels their proposals.
			const { data } = await session.v1.getProposals(
				account.address,
				'localnet',
				{},
			);
			expect(data.map((p) => p.status)).toEqual([
				ProposalStatus.CANCELLED,
			]);

			await expect(
				session.proposeTransfer(proposer, account.address),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);
		});
	});

	test('a new proposal can be fetched by digest, with the proposer signature', async () => {
		const { session, users, account } =
			await framework.createFundedVerifiedAccount(2, 2);

		const proposal = await session.proposeTransfer(
			users[0],
			account.address,
			{ description: 'Test proposal' },
		);

		const byDigest = await session.v1.getProposalByDigest(
			proposal.digest,
		);
		expect(byDigest).toMatchObject(proposal);
		expect(byDigest.signatures).toMatchObject([
			{ publicKey: users[0].publicKey },
		]);
	});

	test('Get paginated proposals', async () => {
		const { session, users, account } =
			await framework.createFundedVerifiedAccount(2, 2);
		await sendCoins(account.address, 10);
		const { objects: coins } = await client.listCoins({
			owner: account.address,
			limit: 20,
		});

		// Each with its own gas coin, so they don't collide.
		for (const gasCoin of coins.slice(0, 10)) {
			await session.createProposal(
				users[0],
				account.address,
				'localnet',
				await buildTransfer(account.address, { gasCoin }),
			);
		}

		const ids = new Set<number>();
		let cursor: number | undefined;
		do {
			const page = await session.v1.getProposals(
				account.address,
				'localnet',
				{ nextCursor: cursor, perPage: 1 },
			);
			expect(page.data).toHaveLength(1);
			ids.add(page.data[0].id);
			cursor = page.hasNextPage
				? Number(page.nextCursor)
				: undefined;
		} while (cursor !== undefined);

		expect(ids.size).toBe(10);
	});

	test('filters proposals by status, including PENDING', async () => {
		const { session, users, account } =
			await framework.createFundedVerifiedAccount(2, 2);

		const cancelled = await session.proposeTransfer(
			users[0],
			account.address,
		);
		await session.cancelProposal(users[0], cancelled.id);
		const pending = await session.createProposal(
			users[0],
			account.address,
			'localnet',
			await buildTransfer(account.address, {
				amount: 2_000_000,
			}),
		);

		const listByStatus = async (status: ProposalStatus) =>
			(
				await session.v1.getProposals(
					account.address,
					'localnet',
					{ status },
				)
			).data.map((p) => ({ id: p.id, status: p.status }));

		expect(
			await listByStatus(ProposalStatus.PENDING),
		).toEqual([
			{ id: pending.id, status: ProposalStatus.PENDING },
		]);
		expect(
			await listByStatus(ProposalStatus.CANCELLED),
		).toEqual([
			{
				id: cancelled.id,
				status: ProposalStatus.CANCELLED,
			},
		]);
	});

	describe('Proposal Cancellation', () => {
		test('a cancelled proposal takes no more votes or cancels', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(2, 2);
			const proposal = await session.proposeTransfer(
				users[0],
				account.address,
			);

			await session.cancelProposal(users[0], proposal.id);

			await expect(
				session.voteOnProposal(users[1], proposal),
			).rejects.toThrow('Proposal is not pending');
			await expect(
				session.cancelProposal(users[0], proposal.id),
			).rejects.toThrow('Proposal is not pending');
		});

		test('non-member cannot cancel a proposal', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(2, 2);
			const proposal = await session.proposeTransfer(
				users[0],
				account.address,
			);

			await expect(
				session.cancelProposal(newUser(), proposal.id),
			).rejects.toThrow('Not a member of the multisig');
		});
	});

	// Status, body and check order of the error responses, locked so that a
	// refactor of the flows cannot change them unnoticed.
	describe('Error responses', () => {
		const unsupportedNetwork = {
			status: 400,
			message:
				'Unsupported network: mainnet. Only localnet, testnet are supported.',
		};

		test('an unsupported network is checked before anything else', async () => {
			const { session } =
				await framework.createAuthenticatedSession(1);
			const accountAddress = newUser().address;

			// Creating: before the signature is even parsed.
			expect(
				await failureOf(
					session.v1.createProposal({
						accountAddress,
						transactionBytes: 'not-a-transaction',
						signature: 'not-a-signature',
						network: 'mainnet',
					}),
				),
			).toEqual(unsupportedNetwork);

			// Listing: before the membership check.
			const list = (network: string) =>
				failureOf(
					session.v1.getProposals(accountAddress, network),
				);
			expect(await list('mainnet')).toEqual(
				unsupportedNetwork,
			);
			expect(await list('localnet')).toEqual(NOT_A_MEMBER);
		});

		test('votes and cancels by non-members, and their check order', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(2, 2);
			const outsider = newUser();
			const proposal = await session.proposeTransfer(
				users[0],
				account.address,
			);

			// `bytes` is the base64 transaction the voter signs.
			const vote = async (
				voter: TestUser,
				proposalId: number,
				bytes: string,
			) =>
				failureOf(
					session.v1.voteForProposal(proposalId, {
						signature: await signTx(voter, bytes),
					}),
				);
			const cancel = async (
				member: TestUser,
				proposalId: number,
				message = PersonalMessages.cancelProposal(
					proposalId,
				),
			) =>
				failureOf(
					session.v1.cancelProposal(proposalId, {
						signature: await sign(member, message),
					}),
				);

			// The proposal is looked up first.
			expect(
				await vote(
					outsider,
					proposal.id + 1000,
					proposal.transactionBytes,
				),
			).toEqual({
				status: 400,
				message: 'Proposal not found',
			});

			// A vote: 403 for a non-member, before its signature is checked.
			expect(
				await vote(
					outsider,
					proposal.id,
					toBase64(new Uint8Array([1, 2, 3])),
				),
			).toEqual(NOT_A_MEMBER);

			// A cancel: 400 for a non-member, before its signature is checked.
			expect(
				await cancel(
					outsider,
					proposal.id,
					'Something else',
				),
			).toEqual({
				status: 400,
				message: 'Not a member of the multisig',
			});
			expect(
				await cancel(
					users[0],
					proposal.id,
					'Something else',
				),
			).toEqual({
				status: 400,
				message: 'Invalid signature for message.',
			});

			// Once cancelled, the status is checked before membership.
			await session.cancelProposal(users[0], proposal.id);
			expect(await cancel(outsider, proposal.id)).toEqual({
				status: 400,
				message: 'Proposal is not pending',
			});
			expect(
				await vote(
					outsider,
					proposal.id,
					proposal.transactionBytes,
				),
			).toEqual(NOT_A_MEMBER);
		});

		test('malformed addresses, digests and ids are refused by the request schema', async () => {
			const { session, users, account } =
				await framework.createFundedVerifiedAccount(2, 2);
			const proposal = await session.proposeTransfer(
				users[0],
				account.address,
			);
			const anonymous = framework.createSession().v1;

			expect(
				await failureOf(
					session.v1.createProposal({
						accountAddress: 'not-an-address',
						transactionBytes: proposal.transactionBytes,
						signature: 'not-a-signature',
						network: 'localnet',
					}),
				),
			).toEqual({
				status: 400,
				message:
					'accountAddress: Must be a valid Sui address.',
			});
			expect(
				await failureOf(
					session.v1.getProposals('0x1', 'localnet'),
				),
			).toEqual({
				status: 400,
				message:
					'accountAddress: Must be a valid Sui address.',
			});

			const badDigest = {
				status: 400,
				message:
					'digest: Must be a valid transaction digest.',
			};
			expect(
				await failureOf(
					anonymous.getProposalByDigest('not-a-digest'),
				),
			).toEqual(badDigest);
			expect(
				await failureOf(
					anonymous.verifyProposalByDigest('not-a-digest'),
				),
			).toEqual(badDigest);
			// A well-formed digest that no proposal has.
			expect(
				await failureOf(
					anonymous.getProposalByDigest(
						'C5xDL4jZ5cDyDqUt1ZwhmB1Mw3vKpA7Y2qTxwZv3Wpv4',
					),
				),
			).toEqual({
				status: 404,
				message: 'The requested resource was not found.',
			});

			expect(
				await failureOf(
					session.v1.voteForProposal(0, {
						signature: 'not-a-signature',
					}),
				),
			).toMatchObject({ status: 400 });
		});
	});
});
