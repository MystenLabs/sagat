// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	type MultisigWithMembers,
} from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import {
	ApiTestFramework,
	buildTransfer,
	multisigSignature,
	sendCoins,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import { rpcCalls } from './setup/rpc-calls';
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
	describe('when objects move on', () => {
		// A 1-of-2 multisig, so every proposal is ready to execute right
		// away, and one of its gas coins.
		async function setup() {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 1);
			const { objects: coins } = await client.listCoins({
				owner: multisig.address,
			});
			return {
				session,
				proposer: users[0],
				multisig,
				gasCoinId: coins[0].objectId,
			};
		}

		// A transfer from the multisig that pays for gas with the given coin,
		// at its current version.
		async function transferWithGasCoin(
			multisigAddress: string,
			gasCoinId: string,
			amount?: number,
		) {
			const { object: gasCoin } = await client.getObject({
				objectId: gasCoinId,
			});
			return buildTransfer(multisigAddress, {
				gasCoin,
				amount,
			});
		}

		// Executes a transaction as the multisig, without going through the
		// API.
		async function executeOutsideApi(
			multisig: MultisigWithMembers,
			signer: TestUser,
			transactionBytes: string,
		) {
			const bytes = fromBase64(transactionBytes);
			const { signature } =
				await signer.keypair.signTransaction(bytes);
			const result = await client.executeTransaction({
				transaction: bytes,
				signatures: [
					multisigSignature(multisig, [
						{ publicKey: signer.publicKey, signature },
					]),
				],
			});
			if (result.$kind !== 'Transaction')
				throw new Error('Transaction failed to execute.');
			await client.waitForTransaction({
				digest: result.Transaction.digest,
			});
		}

		// Spends the gas coin in a transaction that isn't any proposal's.
		async function spendElsewhere(
			multisig: MultisigWithMembers,
			signer: TestUser,
			gasCoinId: string,
		) {
			await executeOutsideApi(
				multisig,
				signer,
				await transferWithGasCoin(
					multisig.address,
					gasCoinId,
					2_000_000,
				),
			);
		}

		async function statusOf(
			session: TestSession,
			digest: string,
		) {
			const proposal =
				await session.client.getProposalByDigest(digest);
			return proposal.status;
		}

		test('refuses a proposal whose gas coin changed since it was built', async () => {
			const { session, proposer, multisig, gasCoinId } =
				await setup();
			const stale = await transferWithGasCoin(
				multisig.address,
				gasCoinId,
			);
			await spendElsewhere(multisig, proposer, gasCoinId);

			await expect(
				session.createProposal(
					proposer,
					multisig.address,
					'localnet',
					stale,
				),
			).rejects.toThrow(
				`The transaction can never execute: objects it uses have changed: ${gasCoinId}.`,
			);
		});

		test('a proposal whose gas coin was spent elsewhere no longer blocks the coin', async () => {
			const { session, proposer, multisig, gasCoinId } =
				await setup();
			const stale = await session.createProposal(
				proposer,
				multisig.address,
				'localnet',
				await transferWithGasCoin(
					multisig.address,
					gasCoinId,
				),
			);
			await spendElsewhere(multisig, proposer, gasCoinId);

			const next = await session.createProposal(
				proposer,
				multisig.address,
				'localnet',
				await transferWithGasCoin(
					multisig.address,
					gasCoinId,
				),
			);

			// Whether it can never execute is for verifying it to decide.
			expect(await statusOf(session, stale.digest)).toBe(
				ProposalStatus.PENDING,
			);
			expect(await statusOf(session, next.digest)).toBe(
				ProposalStatus.PENDING,
			);
		});

		test('a proposal executed without being verified is marked executed', async () => {
			const { session, proposer, multisig, gasCoinId } =
				await setup();
			const executed = await session.createProposal(
				proposer,
				multisig.address,
				'localnet',
				await transferWithGasCoin(
					multisig.address,
					gasCoinId,
				),
			);
			await executeOutsideApi(
				multisig,
				proposer,
				executed.transactionBytes,
			);

			await session.createProposal(
				proposer,
				multisig.address,
				'localnet',
				await transferWithGasCoin(
					multisig.address,
					gasCoinId,
				),
			);

			expect(await statusOf(session, executed.digest)).toBe(
				ProposalStatus.SUCCESS,
			);
		});

		test('creating a proposal looks up the objects it checks once', async () => {
			const { session, proposer, multisig, gasCoinId } =
				await setup();
			await session.createProposal(
				proposer,
				multisig.address,
				'localnet',
				await transferWithGasCoin(
					multisig.address,
					gasCoinId,
				),
			);
			await spendElsewhere(multisig, proposer, gasCoinId);
			const transactionBytes = await transferWithGasCoin(
				multisig.address,
				gasCoinId,
			);

			// The new transaction and the pending proposal share one lookup.
			const before = await rpcCalls('getObjects');
			await session.createProposal(
				proposer,
				multisig.address,
				'localnet',
				transactionBytes,
			);
			expect((await rpcCalls('getObjects')) - before).toBe(
				1,
			);
		});
	});
});
