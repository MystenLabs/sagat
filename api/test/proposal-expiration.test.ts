// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import { toBase58 } from '@mysten/sui/utils';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	spyOn,
	test,
} from 'bun:test';

import * as apiClient from '../src/utils/client';
import {
	ApiTestFramework,
	buildTransfer,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import { getLocalClient } from './setup/sui-network';

const client = getLocalClient();

setupSharedTestEnvironment();

describe('Proposal Expiration', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	// Makes the API see the network `epochs` epochs ahead of where it is.
	// Localnet doesn't change epochs during a test.
	let chainInfo: ReturnType<typeof spyOn> | undefined;
	async function advanceEpochs(epochs: number) {
		const real = await apiClient.getChainInfo('localnet');
		chainInfo = spyOn(
			apiClient,
			'getChainInfo',
		).mockResolvedValue({
			...real,
			systemState: {
				...real.systemState,
				epoch: String(
					BigInt(real.systemState.epoch) + BigInt(epochs),
				),
			},
		});
	}
	afterEach(() => chainInfo?.mockRestore());

	// A 1-of-2 multisig, so every proposal is ready to execute right away,
	// and one of its gas coins.
	async function setup() {
		const { session, users, multisig } =
			await framework.createFundedVerifiedMultisig(2, 1);
		const {
			objects: [gasCoin],
		} = await client.listCoins({
			owner: multisig.address,
		});
		return {
			session,
			proposer: users[0],
			multisig,
			gasCoin,
		};
	}

	// A transfer from the multisig that's only valid in the current and next
	// epoch, on `chain` (this network by default) and until `maxTimestamp`.
	// It sets everything the network would otherwise fill in by simulating
	// it, which fails for some of these expirations.
	async function transferValidDuring(
		multisigAddress: string,
		gasCoin: {
			objectId: string;
			version: string;
			digest: string;
		},
		{
			chain,
			maxTimestamp = null,
		}: {
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
				maxEpoch: String(BigInt(systemState.epoch) + 1n),
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

	test('refuses a proposal that already expired', async () => {
		const { session, proposer, multisig, gasCoin } =
			await setup();
		// Only until a time long gone.
		const transactionBytes = await transferValidDuring(
			multisig.address,
			gasCoin,
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
		const { session, proposer, multisig, gasCoin } =
			await setup();
		const transactionBytes = await transferValidDuring(
			multisig.address,
			gasCoin,
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

	test('verifying a proposal that expired marks it invalid', async () => {
		const { session, proposer, multisig, gasCoin } =
			await setup();
		const proposal = await session.createProposal(
			proposer,
			multisig.address,
			'localnet',
			await transferValidDuring(multisig.address, gasCoin),
		);

		await advanceEpochs(2);
		await session.client.verifyProposalByDigest(
			proposal.digest,
		);

		const { status } =
			await session.client.getProposalByDigest(
				proposal.digest,
			);
		expect(status).toBe(ProposalStatus.INVALID);
	});

	test('a proposal that expired no longer blocks its gas coin', async () => {
		const { session, proposer, multisig, gasCoin } =
			await setup();
		const expired = await session.createProposal(
			proposer,
			multisig.address,
			'localnet',
			await transferValidDuring(multisig.address, gasCoin),
		);

		await advanceEpochs(2);
		await session.createProposal(
			proposer,
			multisig.address,
			'localnet',
			await buildTransfer(multisig.address, { gasCoin }),
		);

		const { status } =
			await session.client.getProposalByDigest(
				expired.digest,
			);
		expect(status).toBe(ProposalStatus.INVALID);
	});

	test("a proposal that hasn't expired stays pending", async () => {
		const { session, proposer, multisig, gasCoin } =
			await setup();
		const proposal = await session.createProposal(
			proposer,
			multisig.address,
			'localnet',
			await transferValidDuring(multisig.address, gasCoin),
		);

		await expect(
			session.client.verifyProposalByDigest(
				proposal.digest,
			),
		).rejects.toThrow(/has not been executed yet/);
	});
});
