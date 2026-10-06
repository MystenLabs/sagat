// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import { toBase58 } from '@mysten/sui/utils';
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	spyOn,
	test,
} from 'bun:test';

import * as apiClient from '../src/utils/client';
import {
	ApiTestFramework,
	type TestSession,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import { getLocalClient } from './setup/sui-network';

const client = getLocalClient();

setupSharedTestEnvironment();

type CoinRef = {
	objectId: string;
	version: string;
	digest: string;
};

describe('Proposal Expiration', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	// Localnet prunes all but its last few seconds of transactions, so
	// pretend its history goes back to the start. (Which also means a
	// proposal that executed before it expired can't be told apart here.)
	let checkpointTimestamp: ReturnType<typeof spyOn>;
	beforeAll(() => {
		checkpointTimestamp = spyOn(
			apiClient,
			'getCheckpointTimestamp',
		).mockResolvedValue(0);
	});
	afterAll(() => checkpointTimestamp.mockRestore());

	// A 1-of-2 multisig, so every proposal is ready to execute right away,
	// and its gas coins.
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
			coins,
		};
	}

	// A transfer from the multisig that's only valid from the current epoch
	// for `epochs` more, on `chain` (this network by default) and until
	// `maxTimestamp`. It sets everything the network would otherwise fill in
	// by simulating it, which fails for some of these expirations.
	async function transferValidDuring(
		multisigAddress: string,
		gasCoin: CoinRef,
		{
			epochs = 1,
			chain,
			maxTimestamp = null,
		}: {
			epochs?: number;
			chain?: string;
			maxTimestamp?: string | null;
		} = {},
	) {
		const [{ chainIdentifier }, { systemState }] =
			await Promise.all([
				client.getChainIdentifier(),
				client.getCurrentSystemState(),
			]);
		const tx = new Transaction();
		tx.setSender(multisigAddress);
		const [coin] = tx.splitCoins(tx.gas, [1_000_000]);
		tx.transferObjects([coin], multisigAddress);
		tx.setExpiration({
			ValidDuring: {
				minEpoch: systemState.epoch,
				maxEpoch: String(
					BigInt(systemState.epoch) + BigInt(epochs),
				),
				minTimestamp: null,
				maxTimestamp,
				chain: chain ?? chainIdentifier,
				nonce: 0,
			},
		});
		tx.setGasPayment([gasCoin]);
		tx.setGasPrice(BigInt(systemState.referenceGasPrice));
		tx.setGasBudget(10_000_000);
		return (await tx.build({ client })).toBase64();
	}

	const currentEpoch = async () => {
		const { systemState } =
			await client.getCurrentSystemState();
		return systemState;
	};

	// The epoch of the last checkpoint the node has executed, which it sends
	// with every response (here, for a transaction that doesn't exist).
	const executedEpoch = async () => {
		const error = await client
			.getTransaction({ digest: '1'.repeat(32) })
			.catch((error) => error);
		return BigInt(error.cause.meta['x-sui-epoch']);
	};

	// Waits until the node has executed a checkpoint past `epoch`. Localnet's
	// epochs last a minute.
	async function waitForEpochAfter(epoch: string) {
		while ((await executedEpoch()) <= BigInt(epoch))
			await Bun.sleep(1000);
	}

	// Makes sure the current epoch has at least `ms` left, so what's
	// created for it doesn't expire too soon.
	async function waitForTimeLeftInEpoch(ms: number) {
		const { epoch, epochStartTimestampMs, parameters } =
			await currentEpoch();
		const end =
			Number(epochStartTimestampMs) +
			Number(parameters.epochDurationMs);
		if (end - Date.now() < ms)
			await waitForEpochAfter(epoch);
	}

	async function statusOf(
		session: TestSession,
		digest: string,
	) {
		const proposal =
			await session.client.getProposalByDigest(digest);
		return proposal.status;
	}

	test('refuses a proposal that already expired', async () => {
		const { session, proposer, multisig, coins } =
			await setup();
		// Only until a time long gone.
		const transactionBytes = await transferValidDuring(
			multisig.address,
			coins[0],
			{ maxTimestamp: '1' },
		);

		await expect(
			session.createProposal(
				proposer,
				multisig.address,
				'localnet',
				transactionBytes,
			),
		).rejects.toThrow(
			'The transaction can never execute: it has expired.',
		);
	});

	test('refuses a proposal for another network', async () => {
		const { session, proposer, multisig, coins } =
			await setup();
		const transactionBytes = await transferValidDuring(
			multisig.address,
			coins[0],
			{ chain: toBase58(new Uint8Array(32).fill(7)) },
		);

		await expect(
			session.createProposal(
				proposer,
				multisig.address,
				'localnet',
				transactionBytes,
			),
		).rejects.toThrow(
			'The transaction can never execute: it is for another network.',
		);
	});

	test("a proposal that hasn't expired stays pending", async () => {
		const { session, proposer, multisig, coins } =
			await setup();
		const proposal = await session.createProposal(
			proposer,
			multisig.address,
			'localnet',
			await transferValidDuring(multisig.address, coins[0]),
		);

		await expect(
			session.client.verifyProposalByDigest(
				proposal.digest,
			),
		).rejects.toThrow(/has not been executed yet/);
		expect(await statusOf(session, proposal.digest)).toBe(
			ProposalStatus.PENDING,
		);
	});

	test(
		'proposals that expired are marked invalid',
		async () => {
			const { session, proposer, multisig, coins } =
				await setup();
			expect(coins.length).toBeGreaterThanOrEqual(2);
			const [verified, replaced] = coins;

			// Proposals only valid in the current epoch.
			await waitForTimeLeftInEpoch(20_000);
			const { epoch } = await currentEpoch();
			const propose = async (gasCoin: CoinRef) =>
				session.createProposal(
					proposer,
					multisig.address,
					'localnet',
					await transferValidDuring(
						multisig.address,
						gasCoin,
						{ epochs: 0 },
					),
				);
			const toVerify = await propose(verified);
			const toReplace = await propose(replaced);

			await waitForEpochAfter(epoch);

			// Verifying one marks it invalid.
			await session.client.verifyProposalByDigest(
				toVerify.digest,
			);
			expect(await statusOf(session, toVerify.digest)).toBe(
				ProposalStatus.INVALID,
			);

			// A new proposal can use the gas coin of another, which is marked
			// invalid along the way.
			await session.createProposal(
				proposer,
				multisig.address,
				'localnet',
				await transferValidDuring(
					multisig.address,
					replaced,
				),
			);
			expect(
				await statusOf(session, toReplace.digest),
			).toBe(ProposalStatus.INVALID);
		},
		{ timeout: 120_000 },
	);
});
