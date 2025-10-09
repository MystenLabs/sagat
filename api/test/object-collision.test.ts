import { Transaction } from '@mysten/sui/transactions';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import { ApiTestFramework } from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import { getLocalClient } from './setup/sui-network';

setupSharedTestEnvironment();

describe('Object Collision Detection', () => {
	let framework: ApiTestFramework;
	const client = getLocalClient();

	beforeEach(async () => {
		const app = await createTestApp();
		framework = new ApiTestFramework(app);
	});

	describe('Owned Object Validation', () => {
		test('prevents concurrent proposals using the same gas coin', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			// Get gas coins from the multisig address
			const coins = await client.getCoins({
				owner: multisig.address,
			});
			const gasCoin = coins.data[0];

			// Create first proposal using specific gas coin
			const tx1 = new Transaction();
			tx1.setSender(multisig.address);
			tx1.setGasPayment([
				{
					objectId: gasCoin.coinObjectId,
					version: gasCoin.version,
					digest: gasCoin.digest,
				},
			]);
			const [coin1] = tx1.splitCoins(gasCoin.coinObjectId, [
				1000000,
			]);
			tx1.transferObjects([coin1], '0x1');

			const proposal = await session.createProposal(
				users[0],
				multisig.address,
				'localnet',
				(await tx1.build({ client })).toBase64(),
				'First proposal with gas coin',
			);

			expect(proposal.id).toBeDefined();

			// Try to create second proposal using same gas coin - should fail
			const tx2 = new Transaction();
			tx2.setSender(multisig.address);
			tx2.setGasPayment([
				{
					objectId: gasCoin.coinObjectId,
					version: gasCoin.version,
					digest: gasCoin.digest,
				},
			]);
			const [coin2] = tx2.splitCoins(gasCoin.coinObjectId, [
				2000000,
			]);
			tx2.transferObjects([coin2], '0x22');

			expect(
				session.createProposal(
					users[0],
					multisig.address,
					'localnet',
					(await tx2.build({ client })).toBase64(),
					'Conflicting proposal with same gas coin',
				),
			).rejects.toThrow(/re-use any owned or receiving/);
		});

		test('allows concurrent proposals using different gas coins', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			// Get multiple gas coins
			const coins = await client.getCoins({
				owner: multisig.address,
			});

			expect(coins.data.length).toBeGreaterThan(1);
			// we shouldn't be over 10!
			expect(coins.data.length).toBeLessThan(10);

			const proposals = [];

			for (const coin of coins.data) {
				const tx = new Transaction();
				tx.setSender(multisig.address);

				tx.setGasPayment([
					{
						objectId: coin.coinObjectId,
						version: coin.version,
						digest: coin.digest,
					},
				]);

				tx.moveCall({
					target: '0x1::option::none',
					arguments: [],
					typeArguments: ['0x1::string::String'],
				});

				const txBytes = (
					await tx.build({ client })
				).toBase64();

				const response = await session.createProposal(
					users[0],
					multisig.address,
					'localnet',
					txBytes,
					`Proposal ${coin.coinObjectId}`,
				);

				expect(response.id).toBeDefined();
				proposals.push(response);
			}

			const uniqueProposals = proposals.filter(
				(proposal, index, self) =>
					index ===
					self.findIndex((t) => t.id === proposal.id),
			);

			expect(uniqueProposals.length).toBe(
				coins.data.length,
			);
		});

		test('allows proposal after previous proposal is resolved', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			const coins = await client.getCoins({
				owner: multisig.address,
			});

			const gasCoin = coins.data[0];
			const recipient =
				'0x5555555555555555555555555555555555555555555555555555555555555555';

			// Create first proposal using direct transaction building
			const tx1 = new Transaction();
			tx1.setSender(multisig.address);
			tx1.setGasPayment([
				{
					objectId: gasCoin.coinObjectId,
					version: gasCoin.version,
					digest: gasCoin.digest,
				},
			]);
			const [coin1] = tx1.splitCoins(gasCoin.coinObjectId, [
				1000000,
			]);
			tx1.transferObjects([coin1], recipient);

			const txBytes1 = (
				await tx1.build({ client })
			).toBase64();

			const response1 = await session.createProposal(
				users[0],
				multisig.address,
				'localnet',
				txBytes1,
				'First proposal',
			);
			expect(response1.id).toBeDefined();

			// Vote to complete the proposal
			const voteResult = await session.voteOnProposal(
				users[1],
				response1.id,
				txBytes1,
			);

			expect(voteResult.hasReachedThreshold).toBe(true);

			// TODO: Fix this test...
			// Note: In a real system, we'd need to execute the proposal to actually free up the objects
			// For this test, we're just verifying the validation logic works for pending proposals
		});

		test('prevents proposals when too many pending (>10)', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			const { keypair } = users[0];
			await session.multiCoinsToAddress(
				keypair,
				multisig.address,
				10,
			);

			// Get available coins
			const coins = await client.getCoins({
				owner: multisig.address,
				limit: 20,
			});

			// Create 10 proposals using different gas coins
			for (let i = 0; i < 10; i++) {
				const tx = new Transaction();
				tx.setSender(multisig.address);
				tx.setGasPayment([
					{
						objectId: coins.data[i].coinObjectId,
						version: coins.data[i].version,
						digest: coins.data[i].digest,
					},
				]);
				const [coin] = tx.splitCoins(tx.gas, [100000]);
				tx.transferObjects([coin], '0x666');

				const txBytes = (
					await tx.build({ client })
				).toBase64();

				const response = await session.createProposal(
					users[0],
					multisig.address,
					'localnet',
					txBytes,
					`Proposal ${i + 1}`,
				);
				expect(response.id).toBeDefined();
			}

			// 11th proposal should fail due to limit
			const tx11 = new Transaction();
			tx11.setSender(multisig.address);
			tx11.setGasPayment([
				{
					objectId: coins.data[10].coinObjectId,
					version: coins.data[10].version,
					digest: coins.data[10].digest,
				},
			]);
			const [coin11] = tx11.splitCoins(
				coins.data[10].coinObjectId,
				[100000],
			);
			tx11.transferObjects([coin11], '0x666');

			const txBytes11 = (
				await tx11.build({ client })
			).toBase64();

			expect(
				session.createProposal(
					users[0],
					multisig.address,
					'localnet',
					txBytes11,
					'Proposal that exceeds limit',
				),
			).rejects.toThrow(/more than 10 pending proposals/);
		});
	});

	describe('Custom Object Usage', () => {
		test('prevents proposals using same custom objects', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			// Get some coins to use as custom objects
			const coins = await client.getCoins({
				owner: multisig.address,
			});

			const sharedCoin = coins.data[0];
			const gasCoin1 = coins.data[1];
			const gasCoin2 = coins.data[2];

			const recipient1 =
				'0x7777777777777777777777777777777777777777777777777777777777777777';
			const recipient2 =
				'0x8888888888888888888888888888888888888888888888888888888888888888';

			// Create first proposal that uses a specific coin
			const tx1 = new Transaction();
			tx1.setSender(multisig.address);
			tx1.setGasPayment([
				{
					objectId: gasCoin1.coinObjectId,
					version: gasCoin1.version,
					digest: gasCoin1.digest,
				},
			]);
			// Use sharedCoin as input to split it
			const [splitCoin1] = tx1.splitCoins(
				sharedCoin.coinObjectId,
				[500000],
			);
			tx1.transferObjects([splitCoin1], recipient1);

			const txBytes1 = (
				await tx1.build({ client })
			).toBase64();

			const response1 = await session.createProposal(
				users[0],
				multisig.address,
				'localnet',
				txBytes1,
				'First proposal using shared coin',
			);
			expect(response1.id).toBeDefined();

			// Try to create second proposal using the same sharedCoin - should fail
			const tx2 = new Transaction();
			tx2.setSender(multisig.address);
			tx2.setGasPayment([
				{
					objectId: gasCoin2.coinObjectId,
					version: gasCoin2.version,
					digest: gasCoin2.digest,
				},
			]);
			// Try to use the same sharedCoin - should conflict
			const [splitCoin2] = tx2.splitCoins(
				sharedCoin.coinObjectId,
				[300000],
			);
			tx2.transferObjects([splitCoin2], recipient2);

			const txBytes2 = (
				await tx2.build({ client })
			).toBase64();

			expect(
				session.createProposal(
					users[0],
					multisig.address,
					'localnet',
					txBytes2,
					'Conflicting proposal using same shared coin',
				),
			).rejects.toThrow(/re-use any owned or receiving/);
		});
	});

	describe('Transaction Resolution', () => {
		// TODO: Fix this test. It has to be not fully resolved, and throw.
		test.skip('requires fully resolved transactions', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			// This test would require creating an unresolved transaction
			// For now, we'll just verify our current transactions are resolved
			const recipient =
				'0x9999999999999999999999999999999999999999999999999999999999999999';

			const proposal =
				await session.createSimpleTransferProposal(
					users[0],
					multisig.address,
					recipient,
					1000000,
					'Resolved transaction test',
				);

			expect(proposal.id).toBeDefined();
			expect(proposal.transactionBytes).toBeDefined();
		});
	});
});
