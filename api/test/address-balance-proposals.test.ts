// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
	coinWithBalance,
	Transaction,
} from '@mysten/sui/transactions';
import { MIST_PER_SUI } from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import {
	ApiTestFramework,
	buildTransfer,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import {
	executeTransaction,
	fundAddress,
	getLocalClient,
} from './setup/sui-network';

setupSharedTestEnvironment();

describe('Address Balance Proposals', () => {
	let framework: ApiTestFramework;
	const client = getLocalClient();

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	async function depositToAddressBalance(
		recipient: string,
		amount: bigint = BigInt(MIST_PER_SUI),
	) {
		const funder = new Ed25519Keypair();
		await fundAddress(funder.toSuiAddress());

		const tx = new Transaction();
		const [coin] = tx.splitCoins(tx.gas, [amount]);
		tx.moveCall({
			target: '0x2::coin::send_funds',
			arguments: [coin, tx.pure.address(recipient)],
			typeArguments: ['0x2::sui::SUI'],
		});
		await executeTransaction(funder, tx);
	}

	async function buildAddressBalanceTx(
		sender: string,
		recipient: string,
		amount: number,
	) {
		const tx = new Transaction();
		tx.setSender(sender);

		const withdrawal = tx.withdrawal({ amount });
		const [coin] = tx.moveCall({
			target: '0x2::coin::redeem_funds',
			arguments: [withdrawal],
			typeArguments: ['0x2::sui::SUI'],
		});
		tx.transferObjects([coin], recipient);

		return tx.build({ client });
	}

	async function buildCoinWithBalanceTx(
		sender: string,
		recipient: string,
		balance: number,
	) {
		const tx = new Transaction();
		tx.setSender(sender);
		const coin = tx.add(
			coinWithBalance({
				balance,
				useGasCoin: false,
			}),
		);
		tx.transferObjects([coin], recipient);

		return tx.build({ client });
	}

	function assertAddressBalanceGas(built: Uint8Array) {
		const parsed = Transaction.from(built);
		const payment = parsed.getData().gasData?.payment || [];
		expect(payment.length).toBe(0);
		expect(parsed.getData().expiration).not.toBeNull();
	}

	describe('Basic Address Balance Proposals', () => {
		test('creates, votes, and executes a proposal using address balance gas', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			await depositToAddressBalance(multisig.address);

			const built = await buildAddressBalanceTx(
				multisig.address,
				'0x1111111111111111111111111111111111111111111111111111111111111111',
				1_000_000,
			);
			assertAddressBalanceGas(built);

			const proposal = await session.createProposal(
				users[0],
				multisig.address,
				'localnet',
				built.toBase64(),
				'Address balance proposal',
			);

			expect(proposal.id).toBeDefined();
			expect(proposal.multisigAddress).toBe(
				multisig.address,
			);

			const tx = await session.voteAndExecute(
				users,
				proposal.digest,
			);
			expect(tx.effects!.status.success).toBe(true);
		});
	});

	describe('Parallel Address Balance Proposals', () => {
		test('creates, votes, and executes multiple proposals in parallel using coinWithBalance', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			await depositToAddressBalance(multisig.address);

			const count = 5;
			const builtTxs: Uint8Array[] = [];

			for (let i = 0; i < count; i++) {
				const recipient = `0x${String(i + 1).padStart(64, '0')}`;
				const built = await buildCoinWithBalanceTx(
					multisig.address,
					recipient,
					100_000 * (i + 1),
				);
				assertAddressBalanceGas(built);
				builtTxs.push(built);
			}

			const proposals = await Promise.all(
				builtTxs.map((built, i) =>
					session.createProposal(
						users[0],
						multisig.address,
						'localnet',
						built.toBase64(),
						`Parallel proposal ${i + 1}`,
					),
				),
			);

			expect(new Set(proposals.map((p) => p.id)).size).toBe(
				count,
			);

			for (const proposal of proposals) {
				const tx = await session.voteAndExecute(
					users,
					proposal.digest,
				);
				expect(tx.effects!.status.success).toBe(true);
			}
		});
	});

	describe('Mixed Gas Payment Proposals', () => {
		test('executes both coin-based and address balance proposals without collision', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			await depositToAddressBalance(multisig.address);

			// Coin-based proposal
			const {
				objects: [gasCoin],
			} = await client.listCoins({
				owner: multisig.address,
			});
			const coinTxBytes = await buildTransfer(
				multisig.address,
				{ gasCoin },
			);

			const coinProposal = await session.createProposal(
				users[0],
				multisig.address,
				'localnet',
				coinTxBytes,
				'Coin-based proposal',
			);

			// Address balance proposal
			const addrBalanceTx = await buildAddressBalanceTx(
				multisig.address,
				'0x3333333333333333333333333333333333333333333333333333333333333333',
				500_000,
			);
			assertAddressBalanceGas(addrBalanceTx);

			const addrBalanceProposal =
				await session.createProposal(
					users[0],
					multisig.address,
					'localnet',
					addrBalanceTx.toBase64(),
					'Address balance proposal',
				);

			expect(addrBalanceProposal.id).not.toBe(
				coinProposal.id,
			);

			const abTx = await session.voteAndExecute(
				users,
				addrBalanceProposal.digest,
			);
			expect(abTx.effects!.status.success).toBe(true);

			const coinTxResult = await session.voteAndExecute(
				users,
				coinProposal.digest,
			);
			expect(coinTxResult.effects!.status.success).toBe(
				true,
			);
		});
	});

	describe('Object Collision With Address Balance Gas', () => {
		test('still detects non-gas owned object collisions', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(2, 2);

			await depositToAddressBalance(multisig.address);

			const coins = await client.listCoins({
				owner: multisig.address,
			});
			const sharedCoin = coins.objects[0];

			const tx1 = new Transaction();
			tx1.setSender(multisig.address);
			const [split1] = tx1.splitCoins(
				sharedCoin.objectId,
				[100_000],
			);
			tx1.transferObjects(
				[split1],
				'0x4444444444444444444444444444444444444444444444444444444444444444',
			);

			const built1 = await tx1.build({ client });
			assertAddressBalanceGas(built1);

			const proposal1 = await session.createProposal(
				users[0],
				multisig.address,
				'localnet',
				built1.toBase64(),
				'First address balance proposal with owned object',
			);
			expect(proposal1.id).toBeDefined();

			const tx2 = new Transaction();
			tx2.setSender(multisig.address);
			const [split2] = tx2.splitCoins(
				sharedCoin.objectId,
				[200_000],
			);
			tx2.transferObjects(
				[split2],
				'0x5555555555555555555555555555555555555555555555555555555555555555',
			);

			const built2 = await tx2.build({ client });
			assertAddressBalanceGas(built2);

			await expect(
				session.createProposal(
					users[0],
					multisig.address,
					'localnet',
					built2.toBase64(),
					'Conflicting address balance proposal',
				),
			).rejects.toThrow(
				`The used objects are: ${sharedCoin.objectId}`,
			);
		});
	});
});
