// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import {
	ApiTestFramework,
	buildTransfer,
	sendCoins,
} from './framework/api-test-framework';
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
		framework = new ApiTestFramework(await createTestApp());
	});

	test('prevents concurrent proposals using the same gas coin', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const {
			objects: [gasCoin],
		} = await client.listCoins({ owner: multisig.address });

		await session.createProposal(
			users[0],
			multisig.address,
			'localnet',
			await buildTransfer(multisig.address, { gasCoin }),
		);

		await expect(
			session.createProposal(
				users[0],
				multisig.address,
				'localnet',
				await buildTransfer(multisig.address, {
					gasCoin,
					amount: 2_000_000,
				}),
			),
		).rejects.toThrow(
			`re-use any owned or receiving objects that are already in pending proposals. The used objects are: ${gasCoin.objectId}`,
		);
	});

	test('prevents concurrent proposals receiving the same object', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const { objects: coins } = await client.listCoins({
			owner: multisig.address,
		});
		expect(coins.length).toBeGreaterThanOrEqual(3);
		const [gasCoin1, gasCoin2, received] = coins;
		const { referenceGasPrice } =
			await client.getReferenceGasPrice();

		// Receives the same object each time, paying for gas with a
		// different coin. Only its inputs matter, so it sets its gas data
		// itself instead of having the network simulate it.
		const receivingTx = async (
			gasCoin: typeof received,
		) => {
			const tx = new Transaction();
			tx.setSender(multisig.address);
			tx.setGasPayment([gasCoin]);
			tx.setGasPrice(BigInt(referenceGasPrice));
			tx.setGasBudget(10_000_000);
			tx.transferObjects(
				[tx.receivingRef(received)],
				multisig.address,
			);
			return (await tx.build({ client })).toBase64();
		};

		await session.createProposal(
			users[0],
			multisig.address,
			'localnet',
			await receivingTx(gasCoin1),
		);

		await expect(
			session.createProposal(
				users[0],
				multisig.address,
				'localnet',
				await receivingTx(gasCoin2),
			),
		).rejects.toThrow(
			`re-use any owned or receiving objects that are already in pending proposals. The used objects are: ${received.objectId}`,
		);
	});

	test('an executed proposal stops blocking its gas coin', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const {
			objects: [gasCoin],
		} = await client.listCoins({ owner: multisig.address });
		const proposal = await session.createProposal(
			users[0],
			multisig.address,
			'localnet',
			await buildTransfer(multisig.address, { gasCoin }),
		);

		const tx = await session.voteAndExecute(
			users,
			proposal.digest,
		);
		expect(tx.effects!.status.success).toBe(true);

		const { object: spentCoin } = await client.getObject({
			objectId: gasCoin.objectId,
		});
		await session.createProposal(
			users[0],
			multisig.address,
			'localnet',
			await buildTransfer(multisig.address, {
				gasCoin: spentCoin,
			}),
		);
	});

	test('allows concurrent proposals using different gas coins', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		const { objects: coins } = await client.listCoins({
			owner: multisig.address,
		});
		expect(coins.length).toBeGreaterThan(1);

		const proposals = [];
		for (const gasCoin of coins) {
			proposals.push(
				await session.createProposal(
					users[0],
					multisig.address,
					'localnet',
					await buildTransfer(multisig.address, {
						gasCoin,
					}),
				),
			);
		}

		expect(new Set(proposals.map((p) => p.id)).size).toBe(
			coins.length,
		);
	});

	test('prevents proposals when too many pending (>10)', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);
		await sendCoins(multisig.address, 10);
		const { objects: coins } = await client.listCoins({
			owner: multisig.address,
			limit: 20,
		});

		const propose = async (
			gasCoin: (typeof coins)[number],
		) =>
			session.createProposal(
				users[0],
				multisig.address,
				'localnet',
				await buildTransfer(multisig.address, { gasCoin }),
			);

		for (const gasCoin of coins.slice(0, 10))
			await propose(gasCoin);

		await expect(propose(coins[10])).rejects.toThrow(
			/more than 10 pending proposals/,
		);
	});

	test('rejects unresolved transactions', async () => {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 2);

		const tx = new Transaction();
		const [coin] = tx.splitCoins(tx.gas, [500000]);
		tx.transferObjects([coin], multisig.address);
		// Serialize without building — no sender, no gas resolution
		const unresolvedBytes = await tx.toJSON();

		const signature =
			await users[0].keypair.signPersonalMessage(
				new TextEncoder().encode(unresolvedBytes),
			);

		await expect(
			session.client.createProposal({
				multisigAddress: multisig.address,
				network: 'localnet',
				transactionBytes: unresolvedBytes,
				signature: signature.signature,
			}),
		).rejects.toThrow('not fully resolved');
	});
});
