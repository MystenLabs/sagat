// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { messageWithIntent } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import {
	fromBase64,
	normalizeSuiAddress,
	SUI_TYPE_ARG,
	toBase58,
	toBase64,
	toHex,
} from '@mysten/sui/utils';
import { blake2b } from '@noble/hashes/blake2.js';
import { beforeAll, describe, expect, test } from 'vitest';

import { formatDateTime } from '../src/lib/dates';
import {
	buildTransactionPreview,
	type SimulatedTransaction,
	type TransactionPreviewInput,
} from '../src/lib/transaction-preview';

const SENDER = normalizeSuiAddress(
	'0x5d2e00000000000000000000000000000000000000000000000000000000a1b7',
);
const RECIPIENT = normalizeSuiAddress(
	'0x8d4a000000000000000000000000000000000000000000000000000000003f10',
);
const SPONSOR = normalizeSuiAddress(
	'0x7c1f00000000000000000000000000000000000000000000000000000000e2d9',
);
const USDC =
	'0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

// 0.0041 SUI net: 3,000,000 + 2,000,000 - 900,000.
const GAS = {
	computationCost: '3000000',
	storageCost: '2000000',
	storageRebate: '900000',
};
const COST = 4_100_000n;
const SENT = 1_000n;

// A SUI transfer from SENDER to RECIPIENT that builds offline: the gas
// coin, price and budget are pinned so no client is needed. Pass
// `gasOwner` to have that address sponsor the gas.
async function transferBytes(gasOwner?: string) {
	const tx = new Transaction();
	tx.setSender(SENDER);
	if (gasOwner) tx.setGasOwner(gasOwner);
	tx.setGasPayment([
		{
			objectId: normalizeSuiAddress('0x1234'),
			version: '1',
			digest: toBase58(new Uint8Array(32).fill(7)),
		},
	]);
	tx.setGasPrice(1000n);
	tx.setGasBudget(10_000_000n);
	const [coin] = tx.splitCoins(tx.gas, [SENT]);
	tx.transferObjects([coin], RECIPIENT);
	return toBase64(await tx.build());
}

// A dry run's payload, with just what the preview reads.
function simulated({
	balanceChanges,
	epoch = '812',
	error,
	gasUsed = GAS,
}: {
	balanceChanges: SuiClientTypes.BalanceChange[];
	epoch?: string;
	error?: string;
	gasUsed?: typeof GAS;
}): SimulatedTransaction {
	const status = error
		? { success: false, error: { message: error } }
		: { success: true, error: null };
	return {
		epoch,
		status,
		balanceChanges,
		effects: {
			status,
			gasUsed: { ...gasUsed, nonRefundableStorageFee: '0' },
			changedObjects: [],
		},
		events: [],
		objectTypes: {},
	} as unknown as SimulatedTransaction;
}

let bytes: string;
beforeAll(async () => {
	bytes = await transferBytes();
});

function preview(
	input: Partial<TransactionPreviewInput> = {},
) {
	return buildTransactionPreview({
		bytes,
		status: 'passed',
		network: 'mainnet',
		...input,
	});
}

describe('buildTransactionPreview', () => {
	test('reads the digest and the sender from the bytes, naming a known sender', async () => {
		const unnamed = preview();
		expect(unnamed.digest).toBe(
			await Transaction.from(bytes).getDigest(),
		);
		expect(unnamed.sender).toEqual({
			address: SENDER,
			name: null,
		});

		const named = preview({
			accounts: [{ address: SENDER, name: 'Treasury' }],
		});
		expect(named.sender).toEqual({
			address: SENDER,
			name: 'Treasury',
		});
	});

	test('the Ledger hash is the blake2b-256 of the intent message', () => {
		const expected = `0x${toHex(
			blake2b(
				messageWithIntent(
					'TransactionData',
					fromBase64(bytes),
				),
				{ dkLen: 32 },
			),
		)}`;
		expect(preview().ledgerHash).toBe(expected);
	});

	test('splits the sender’s gas out of its SUI change, last', () => {
		const model = preview({
			result: simulated({
				balanceChanges: [
					{
						address: SENDER,
						coinType: SUI_TYPE_ARG,
						amount: (-(SENT + COST)).toString(),
					},
					{
						address: RECIPIENT,
						coinType: SUI_TYPE_ARG,
						amount: SENT.toString(),
					},
				],
			}),
		});
		expect(model.balanceChanges).toEqual([
			{
				address: SENDER,
				label: null,
				gas: false,
				coinType: SUI_TYPE_ARG,
				amount: (-SENT).toString(),
			},
			{
				address: RECIPIENT,
				label: 'Recipient',
				gas: false,
				coinType: SUI_TYPE_ARG,
				amount: SENT.toString(),
			},
			{
				address: SENDER,
				label: null,
				gas: true,
				coinType: SUI_TYPE_ARG,
				amount: (-COST).toString(),
			},
		]);
	});

	test('a storage rebate above the cost is a positive gas row and the sender’s row is the transfer', () => {
		// -0.0019 SUI net: 1,000,000 + 2,000,000 - 4,900,000.
		const rebate = 1_900_000n;
		const sent = 1_500_000_000n;
		const model = preview({
			result: simulated({
				gasUsed: {
					computationCost: '1000000',
					storageCost: '2000000',
					storageRebate: '4900000',
				},
				balanceChanges: [
					{
						address: SENDER,
						coinType: SUI_TYPE_ARG,
						amount: (-(sent - rebate)).toString(),
					},
					{
						address: RECIPIENT,
						coinType: SUI_TYPE_ARG,
						amount: sent.toString(),
					},
				],
			}),
		});
		expect(
			model.balanceChanges
				.filter((row) => row.address === SENDER)
				.map(({ amount, gas }) => ({ amount, gas })),
		).toEqual([
			{ amount: (-sent).toString(), gas: false },
			{ amount: rebate.toString(), gas: true },
		]);
		expect(model.gas).toBe('0.0019 SUI rebate');
	});

	test('a transaction that only pays gas has just the gas row', () => {
		const model = preview({
			result: simulated({
				balanceChanges: [
					{
						address: SENDER,
						coinType: SUI_TYPE_ARG,
						amount: (-COST).toString(),
					},
				],
			}),
		});
		expect(model.balanceChanges).toEqual([
			{
				address: SENDER,
				label: null,
				gas: true,
				coinType: SUI_TYPE_ARG,
				amount: (-COST).toString(),
			},
		]);
	});

	test('a token transfer keeps the sender’s token row and adds the gas row', () => {
		const model = preview({
			result: simulated({
				balanceChanges: [
					{
						address: SENDER,
						coinType: USDC,
						amount: '-5000000',
					},
					{
						address: SENDER,
						coinType: SUI_TYPE_ARG,
						amount: (-COST).toString(),
					},
					{
						address: RECIPIENT,
						coinType: USDC,
						amount: '5000000',
					},
				],
			}),
		});
		expect(
			model.balanceChanges.map(
				({ coinType, amount, gas }) => ({
					coinType,
					amount,
					gas,
				}),
			),
		).toEqual([
			{ coinType: USDC, amount: '-5000000', gas: false },
			{ coinType: USDC, amount: '5000000', gas: false },
			{
				coinType: SUI_TYPE_ARG,
				amount: (-COST).toString(),
				gas: true,
			},
		]);
	});

	test('a sponsored transaction splits the gas out of the sponsor’s SUI change and leaves the sender’s alone', async () => {
		const sponsored = await transferBytes(SPONSOR);
		expect(
			Transaction.from(sponsored).getData().gasData.owner,
		).toBe(SPONSOR);

		const model = preview({
			bytes: sponsored,
			result: simulated({
				balanceChanges: [
					{
						address: SENDER,
						coinType: SUI_TYPE_ARG,
						amount: (-SENT).toString(),
					},
					{
						address: RECIPIENT,
						coinType: SUI_TYPE_ARG,
						amount: SENT.toString(),
					},
					{
						address: SPONSOR,
						coinType: SUI_TYPE_ARG,
						amount: (-COST).toString(),
					},
				],
			}),
		});
		expect(model.balanceChanges).toEqual([
			{
				address: SENDER,
				label: null,
				gas: false,
				coinType: SUI_TYPE_ARG,
				amount: (-SENT).toString(),
			},
			{
				address: RECIPIENT,
				label: 'Recipient',
				gas: false,
				coinType: SUI_TYPE_ARG,
				amount: SENT.toString(),
			},
			{
				address: SPONSOR,
				label: null,
				gas: true,
				coinType: SUI_TYPE_ARG,
				amount: (-COST).toString(),
			},
		]);
		expect(
			model.balanceChanges.some(
				(row) => row.gas && row.address === SENDER,
			),
		).toBe(false);
	});

	test('adds no gas row without a gas payer SUI change', () => {
		const model = preview({
			result: simulated({
				balanceChanges: [
					{
						address: RECIPIENT,
						coinType: SUI_TYPE_ARG,
						amount: SENT.toString(),
					},
				],
			}),
		});
		expect(
			model.balanceChanges.some((row) => row.gas),
		).toBe(false);
		expect(model.balanceChanges).toHaveLength(1);
	});

	test('while pending, shows what the bytes give and nothing from the run', () => {
		const model = preview({ status: 'pending' });
		expect(model.statusMeta).toBe('Mainnet');
		expect(model.epoch).toBeNull();
		expect(model.gas).toBeNull();
		expect(model.balanceChanges).toEqual([]);
		expect(model.raw).toBeNull();
		expect(model.digest).not.toBe('');
		expect(model.ledgerHash).not.toBe('');
		expect(model.sender?.address).toBe(SENDER);
	});

	test('once simulated, the status line has the time', () => {
		const simulatedAt = new Date('2026-10-13T08:54:00Z');
		expect(
			preview({
				simulatedAt,
				result: simulated({ balanceChanges: [] }),
			}).statusMeta,
		).toBe(`Mainnet · ${formatDateTime(simulatedAt)}`);
	});

	test('a refused transaction shows the given error and no run', () => {
		const model = preview({
			status: 'failed',
			error: 'Transaction Expired',
		});
		expect(model.error).toBe('Transaction Expired');
		expect(model.epoch).toBeNull();
		expect(model.gas).toBeNull();
	});

	test('a transaction that ran and failed shows the payload’s error and gas', () => {
		const model = preview({
			status: 'failed',
			result: simulated({
				balanceChanges: [],
				error: 'MoveAbort in 1st command',
			}),
		});
		expect(model.error).toBe('MoveAbort in 1st command');
		expect(model.epoch).toBe('812');
		expect(model.gas).toBe('0.0041 SUI');
	});
});
