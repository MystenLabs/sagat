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

import { hasExpired } from '../src/services/proposal-status.service';
import { getSystemState } from '../src/utils/client';
import {
	ApiTestFramework,
	buildTransfer,
	multisigSignature,
	type TestSession,
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

describe('Proposal Invalidation', () => {
	let framework: ApiTestFramework;

	beforeEach(async () => {
		framework = new ApiTestFramework(await createTestApp());
	});

	// A 1-of-2 multisig, so every proposal is ready to execute right away,
	// and one of its gas coins.
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

	// A transfer from the multisig that pays for gas with the given coin, at
	// its current version.
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

	// Executes a transaction as the multisig, without going through the API.
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

	test('verifying a proposal whose gas coin was spent elsewhere marks it invalid', async () => {
		const { session, proposer, multisig, gasCoinId } =
			await setup();
		const proposal = await session.createProposal(
			proposer,
			multisig.address,
			'localnet',
			await transferWithGasCoin(
				multisig.address,
				gasCoinId,
			),
		);

		await spendElsewhere(multisig, proposer, gasCoinId);
		await session.client.verifyProposalByDigest(
			proposal.digest,
		);

		expect(await statusOf(session, proposal.digest)).toBe(
			ProposalStatus.INVALID,
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

		expect(await statusOf(session, stale.digest)).toBe(
			ProposalStatus.INVALID,
		);
		expect(await statusOf(session, next.digest)).toBe(
			ProposalStatus.PENDING,
		);
	});

	test('a proposal whose object was deleted elsewhere stays pending', async () => {
		// A missing object may just be one the node hasn't seen yet, so it
		// doesn't prove anything.
		const { session, proposer, multisig } = await setup();
		const { objects: coins } = await client.listCoins({
			owner: multisig.address,
		});
		expect(coins.length).toBeGreaterThanOrEqual(3);
		const [gasCoin, coin, otherGasCoin] = coins;
		const tx = new Transaction();
		tx.setSender(multisig.address);
		tx.setGasPayment([gasCoin]);
		tx.transferObjects(
			[tx.object(coin.objectId)],
			multisig.address,
		);
		const proposal = await session.createProposal(
			proposer,
			multisig.address,
			'localnet',
			(await tx.build({ client })).toBase64(),
		);

		// Merging the coin into another one deletes it.
		const merge = new Transaction();
		merge.setSender(multisig.address);
		merge.setGasPayment([otherGasCoin]);
		merge.mergeCoins(merge.gas, [
			merge.object(coin.objectId),
		]);
		await executeOutsideApi(
			multisig,
			proposer,
			(await merge.build({ client })).toBase64(),
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

		// Finalizing the stale proposal and checking for reused objects share
		// one lookup.
		const before = await rpcCalls('getObjects');
		await session.createProposal(
			proposer,
			multisig.address,
			'localnet',
			transactionBytes,
		);
		expect((await rpcCalls('getObjects')) - before).toBe(1);
	});

	test('a proposal executed without being verified is marked executed, not invalid', async () => {
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
});

describe('hasExpired', () => {
	// Epoch 10 started at time 1000.
	const now = {
		epoch: '10',
		epochStartTimestampMs: '1000',
	};
	const window: {
		minEpoch: string | null;
		maxEpoch: string | null;
		minTimestamp: string | null;
		maxTimestamp: string | null;
		chain: string;
		nonce: number;
	} = {
		minEpoch: null,
		maxEpoch: null,
		minTimestamp: null,
		maxTimestamp: null,
		chain: '',
		nonce: 0,
	};

	test('a transaction without an expiration never expires', () => {
		expect(hasExpired(null, now)).toBe(false);
		expect(
			hasExpired({ $kind: 'None', None: true }, now),
		).toBe(false);
	});

	test('an epoch expiration passes once that epoch is over', () => {
		expect(
			hasExpired({ $kind: 'Epoch', Epoch: '10' }, now),
		).toBe(false);
		expect(
			hasExpired({ $kind: 'Epoch', Epoch: '9' }, now),
		).toBe(true);
	});

	for (const $kind of [
		'ValidDuring',
		'Validity',
	] as const) {
		const expiration = (
			bounds: Partial<typeof window>,
		): Parameters<typeof hasExpired>[0] =>
			$kind === 'ValidDuring'
				? { $kind, ValidDuring: { ...window, ...bounds } }
				: {
						$kind,
						Validity: {
							...window,
							...bounds,
							allowedProposers: null,
						},
					};

		test(`a ${$kind} expiration passes once its last epoch is over`, () => {
			expect(
				hasExpired(expiration({ maxEpoch: '10' }), now),
			).toBe(false);
			expect(
				hasExpired(expiration({ maxEpoch: '9' }), now),
			).toBe(true);
		});

		test(`a ${$kind} expiration passes once its latest time is before the current epoch`, () => {
			expect(
				hasExpired(
					expiration({ maxTimestamp: '1000' }),
					now,
				),
			).toBe(false);
			expect(
				hasExpired(
					expiration({ maxTimestamp: '999' }),
					now,
				),
			).toBe(true);
		});

		test(`a ${$kind} expiration that hasn't started yet hasn't expired`, () => {
			expect(
				hasExpired(
					expiration({ minEpoch: '11', maxEpoch: '12' }),
					now,
				),
			).toBe(false);
		});
	}
});

describe('getSystemState', () => {
	test('requests share one fetch of the system state', async () => {
		const first = getSystemState('localnet');
		expect(getSystemState('localnet')).toBe(first);
		expect((await first).epoch).toBeDefined();
	});
});
