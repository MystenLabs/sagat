// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
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
	newUser,
	sendCoins,
} from './framework/api-test-framework';
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
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			const signed = await buildTransfer(multisig.address, {
				amount: 500_000,
			});
			const submitted = await buildTransfer(
				multisig.address,
				{ amount: 999_999 },
			);
			const { signature } =
				await users[0].keypair.signTransaction(
					fromBase64(signed),
				);

			await expect(
				session.client.createProposal({
					multisigAddress: multisig.address,
					network: 'localnet',
					transactionBytes: submitted,
					signature,
				}),
			).rejects.toThrow(/Invalid Sui signature/);
		});

		test('prevents duplicate proposals with same transaction digest', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

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
				tx.setSender(multisig.address);
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
				tx.transferObjects([coin], multisig.address);
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
				multisig.address,
				'localnet',
				tx1.bytes,
			);

			await expect(
				session.createProposal(
					users[0],
					multisig.address,
					'localnet',
					tx2.bytes,
				),
			).rejects.toThrow(/same digest/);
		});

		test('verifying a proposal that was never executed is a client error', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 1);

			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);

			await expect(
				session.client.verifyProposalByDigest(
					proposal.digest,
				),
			).rejects.toThrow(/has not been executed yet/);
		});
	});

	test('weighs votes by member weight', async () => {
		const { session, users } =
			await framework.createAuthenticatedSession(3);
		const multisig = await session.createMultisig(
			users,
			3,
			{
				weights: [1, 2, 1],
				fund: true,
			},
		);
		await session.acceptMultisig(
			users[1],
			multisig.address,
		);

		const proposal = await session.proposeTransfer(
			users[0],
			multisig.address,
		);

		// 1 + 1 out of 3.
		expect(
			(
				await session.voteOnProposal(
					users[2],
					proposal.id,
					proposal.transactionBytes,
				)
			).hasReachedThreshold,
		).toBe(false);
		// 1 + 1 + 2 out of 3.
		expect(
			(
				await session.voteOnProposal(
					users[1],
					proposal.id,
					proposal.transactionBytes,
				)
			).hasReachedThreshold,
		).toBe(true);
	});

	describe('Vote Validation', () => {
		test('prevents duplicate voting by same member', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);

			// The proposer already voted by proposing.
			await expect(
				session.voteOnProposal(
					users[0],
					proposal.id,
					proposal.transactionBytes,
				),
			).rejects.toThrow('already voted');
		});

		test('rejects vote when signature is for a different transaction', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(3, 2);

			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);
			const { signature } =
				await users[1].keypair.signTransaction(
					fromBase64(
						await buildTransfer(multisig.address, {
							amount: 999_999,
						}),
					),
				);

			await expect(
				session.client.voteForProposal(proposal.id, {
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
			const multisig = await session.createMultisig(
				[users[0], invitee],
				2,
				{ fund: true },
			);

			await expect(
				session.proposeTransfer(invitee, multisig.address),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);
		});

		test('non-members cannot propose or vote', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const outsider = newUser();

			await expect(
				session.proposeTransfer(outsider, multisig.address),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);

			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);
			await expect(
				session.voteOnProposal(
					outsider,
					proposal.id,
					proposal.transactionBytes,
				),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);
		});
	});

	describe('Proposer Access Control', () => {
		test('Only members can add proposers', async () => {
			const { session, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const outsider = newUser();

			await expect(
				session.addProposer(
					outsider,
					outsider.address,
					multisig.address,
				),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);
		});

		test('Try to add proposer with expired signature', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			await expect(
				session.addProposer(
					users[0],
					newUser().address,
					multisig.address,
					'2021-01-01',
				),
			).rejects.toThrow('Signature has expired');
		});

		test('Add proposer, propose, remove proposer, try to propose and fail', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const proposer = newUser();

			await session.addProposer(
				users[0],
				proposer.address,
				multisig.address,
			);
			await session.proposeTransfer(
				proposer,
				multisig.address,
			);

			await session.removeProposer(
				users[0],
				proposer.address,
				multisig.address,
			);

			// Removing the proposer cancels their proposals.
			const { data } = await session.client.getProposals(
				multisig.address,
				'localnet',
				{},
			);
			expect(data.map((p) => p.status)).toEqual([
				ProposalStatus.CANCELLED,
			]);

			await expect(
				session.proposeTransfer(proposer, multisig.address),
			).rejects.toThrow(AuthErrors.NotAMultisigMember);
		});
	});

	test('a new proposal can be fetched by digest, with the proposer signature', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);

		const proposal = await session.proposeTransfer(
			users[0],
			multisig.address,
			'Test proposal',
		);

		const byDigest =
			await session.client.getProposalByDigest(
				proposal.digest,
			);
		expect(byDigest).toMatchObject(proposal);
		expect(byDigest.signatures).toMatchObject([
			{ publicKey: users[0].publicKey },
		]);
	});

	test('Get paginated proposals', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		await sendCoins(multisig.address, 10);
		const { objects: coins } = await client.listCoins({
			owner: multisig.address,
			limit: 20,
		});

		// Each with its own gas coin, so they don't collide.
		for (const gasCoin of coins.slice(0, 10)) {
			await session.createProposal(
				users[0],
				multisig.address,
				'localnet',
				await buildTransfer(multisig.address, { gasCoin }),
			);
		}

		const ids = new Set<number>();
		let cursor: number | undefined;
		do {
			const page = await session.client.getProposals(
				multisig.address,
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

	describe('Proposal Cancellation', () => {
		test('a cancelled proposal takes no more votes or cancels', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);

			await session.cancelProposal(users[0], proposal.id);

			await expect(
				session.voteOnProposal(
					users[1],
					proposal.id,
					proposal.transactionBytes,
				),
			).rejects.toThrow('Proposal is not pending');
			await expect(
				session.cancelProposal(users[0], proposal.id),
			).rejects.toThrow('Proposal is not pending');
		});

		test('non-member cannot cancel a proposal', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);
			const proposal = await session.proposeTransfer(
				users[0],
				multisig.address,
			);

			await expect(
				session.cancelProposal(newUser(), proposal.id),
			).rejects.toThrow('Not a member of the multisig');
		});
	});
});
