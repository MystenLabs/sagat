// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PublicProposal } from '@mysten/sagat';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import {
	coinWithBalance,
	Transaction,
} from '@mysten/sui/transactions';
import { fromBase64, MIST_PER_SUI } from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';

import { parsePublicKey } from '../src/utils/pubKey';
import {
	ApiTestFramework,
	type TestSession,
	type TestUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import {
	fundAddress,
	getLocalClient,
} from './setup/sui-network';

setupSharedTestEnvironment();

describe('Address Balance Proposals', () => {
	let framework: ApiTestFramework;
	const client = getLocalClient();

	beforeEach(async () => {
		const app = await createTestApp();
		framework = new ApiTestFramework(app);
	});

	async function depositToAddressBalance(
		funder: Ed25519Keypair,
		recipient: string,
		amount: bigint = BigInt(MIST_PER_SUI),
	) {
		await fundAddress(funder.toSuiAddress());

		const tx = new Transaction();
		tx.setSender(funder.toSuiAddress());

		const [coin] = tx.splitCoins(tx.gas, [amount]);
		tx.moveCall({
			target: '0x2::coin::send_funds',
			arguments: [coin, tx.pure.address(recipient)],
			typeArguments: ['0x2::sui::SUI'],
		});

		const result =
			await funder.signAndExecuteTransaction({
				transaction: tx,
				client,
			});

		if (result.$kind !== 'Transaction')
			throw new Error(
				'send_funds transaction failed to execute.',
			);

		await client.waitForTransaction({
			digest: result.Transaction.digest,
		});
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
		const payment =
			parsed.getData().gasData?.payment || [];
		expect(payment.length).toBe(0);
		expect(parsed.getData().expiration).not.toBeNull();
	}

	/**
	 * Collects remaining votes needed to reach threshold,
	 * combines into a multisig signature, executes on chain,
	 * and verifies the result through the API.
	 */
	async function voteAndExecute(
		session: TestSession,
		voters: TestUser[],
		proposalDigest: string,
	) {
		const proposal = await session
			.getStatefulClient()
			.getProposalByDigest(proposalDigest);

		for (const voter of voters) {
			const alreadySigned = proposal.signatures.some(
				(sig) =>
					sig.publicKey ===
					voter.keypair
						.getPublicKey()
						.toSuiPublicKey(),
			);
			if (alreadySigned) continue;

			const { hasReachedThreshold } =
				await session.voteOnProposal(
					voter,
					proposal.id,
					proposal.transactionBytes,
				);

			if (hasReachedThreshold) break;
		}

		// Re-fetch to get all signatures after voting
		const signed = await session
			.getStatefulClient()
			.getProposalByDigest(proposalDigest);

		const combinedSignature =
			combineMultisigSignatures(signed);

		const result = await client.executeTransaction({
			transaction: fromBase64(
				signed.transactionBytes,
			),
			signatures: [combinedSignature],
			include: { effects: true },
		});

		const tx =
			result.$kind === 'Transaction'
				? result.Transaction
				: result.FailedTransaction;

		await client.waitForTransaction({
			digest: tx.digest,
		});

		await session
			.getStatefulClient()
			.verifyProposalByDigest(proposalDigest);

		return tx;
	}

	function combineMultisigSignatures(
		proposal: PublicProposal,
	) {
		const members = proposal.multisig.members.sort(
			(a, b) => a.order - b.order,
		);

		const multisigPubKey =
			MultiSigPublicKey.fromPublicKeys({
				threshold: proposal.multisig.threshold,
				publicKeys: members.map((m) => ({
					publicKey: parsePublicKey(m.publicKey),
					weight: m.weight,
				})),
			});

		const orderedSignatures = members
			.map((member) =>
				proposal.signatures.find(
					(sig) => sig.publicKey === member.publicKey,
				),
			)
			.filter(Boolean)
			.map((sig) => sig!.signature);

		return multisigPubKey.combinePartialSignatures(
			orderedSignatures,
		);
	}

	describe('Basic Address Balance Proposals', () => {
		test('creates, votes, and executes a proposal using address balance gas', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(
					2,
					2,
				);

			await depositToAddressBalance(
				users[0].keypair,
				multisig.address,
			);

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

			const tx = await voteAndExecute(
				session,
				users,
				proposal.digest,
			);
			expect(tx.effects!.status.success).toBe(true);
		});
	});

	describe('Parallel Address Balance Proposals', () => {
		test('creates, votes, and executes multiple proposals in parallel using coinWithBalance', async () => {
			const { session, users, multisig } =
				await framework.createFundedVerifiedMultisig(
					2,
					2,
				);

			await depositToAddressBalance(
				users[0].keypair,
				multisig.address,
			);

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

			expect(
				new Set(proposals.map((p) => p.id)).size,
			).toBe(count);

			for (const proposal of proposals) {
				const tx = await voteAndExecute(
					session,
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
				await framework.createFundedVerifiedMultisig(
					2,
					2,
				);

			await depositToAddressBalance(
				users[0].keypair,
				multisig.address,
			);

			// Coin-based proposal
			const coins = await client.listCoins({
				owner: multisig.address,
			});
			const gasCoin = coins.objects[0];

			const coinTx = new Transaction();
			coinTx.setSender(multisig.address);
			coinTx.setGasPayment([
				{
					objectId: gasCoin.objectId,
					version: gasCoin.version,
					digest: gasCoin.digest,
				},
			]);
			const [coin1] = coinTx.splitCoins(coinTx.gas, [
				500_000,
			]);
			coinTx.transferObjects(
				[coin1],
				'0x2222222222222222222222222222222222222222222222222222222222222222',
			);

			const coinTxBytes = (
				await coinTx.build({ client })
			).toBase64();

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

			const abTx = await voteAndExecute(
				session,
				users,
				addrBalanceProposal.digest,
			);
			expect(abTx.effects!.status.success).toBe(true);

			const coinTxResult = await voteAndExecute(
				session,
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
				await framework.createFundedVerifiedMultisig(
					2,
					2,
				);

			await depositToAddressBalance(
				users[0].keypair,
				multisig.address,
			);

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

			await expect(
				session.createProposal(
					users[0],
					multisig.address,
					'localnet',
					built2.toBase64(),
					'Conflicting address balance proposal',
				),
			).rejects.toThrow(/re-use any owned or receiving/);
		});
	});
});
