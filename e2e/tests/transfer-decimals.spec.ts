// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Transfers of coins with 0 and 18 decimals through the wizard: what the
// amount field accepts, Review's balance change, and the raw amounts that
// land on chain.
import { type Page } from '@playwright/test';

import { content } from '../../app/src/content';
import {
	randomAddress,
	type Chain,
} from '../support/chain';
import {
	expect,
	test,
	type Fixtures,
} from '../support/fixtures';
import {
	amountError,
	balanceChange,
	expectSimulation,
	fillTransfer,
	openNewProposal,
	proposeAndSign,
	reviewTransfer,
	sharedAccount,
} from '../support/new-proposal';
import {
	mintCoin,
	publishTestCoin,
	type CoinMetadata,
	type TestCoin,
} from '../support/test-coin';

// Alice and Bob share an account holding SUI for gas and, for each entry
// of `coins`, one coin per amount in `minted` of a new coin with
// `metadata`. 1-of-2, so Alice's proposals are ready to execute as soon
// as she makes them. Alice is signed in.
async function accountWithCoins(
	fixtures: Fixtures,
	coins: { minted: bigint[]; metadata: CoinMetadata }[],
) {
	const { chain } = fixtures;
	// One at a time and before the account: a build blocks the event loop,
	// which would stall requests in flight.
	const published: TestCoin[] = [];
	for (const { metadata } of coins)
		published.push(await publishTestCoin(chain, metadata));
	const { alice, multisig } = await sharedAccount(
		fixtures,
		1,
	);
	const coinTypes = await Promise.all(
		coins.map(({ minted }, i) =>
			mintCoin(
				chain,
				published[i],
				multisig.address,
				minted,
			),
		),
	);
	return {
		page: alice.page,
		account: multisig.address,
		coinTypes,
	};
}

const coin = (decimals: number, symbol: string) => ({
	decimals,
	symbol,
	name: `${symbol} Coin`,
});

async function expectAmount(
	page: Page,
	error: string | null,
) {
	const shown = amountError(page);
	const review = page.getByTestId('transfer-review');
	if (error === null) {
		await expect(shown).toHaveCount(0);
		await expect(review).toBeEnabled();
	} else {
		await expect(shown).toHaveText(error);
		await expect(review).toBeDisabled();
	}
}

/**
 * From a filled Details step: checks on Review that the recipient gains
 * `raw` and the account loses it, proposes and executes, and checks that
 * the chain moved exactly `raw`, leaving the account `left`.
 */
async function proposeAndExecute(
	page: Page,
	chain: Chain,
	{
		account,
		coinType,
		recipient,
		raw,
		left,
	}: {
		account: string;
		coinType: string;
		recipient: string;
		raw: bigint;
		left: bigint;
	},
) {
	await reviewTransfer(page);
	await expectSimulation(page, 'success');
	const change = (address: string) =>
		balanceChange(page, address).and(
			page.locator(`[data-coin-type="${coinType}"]`),
		);
	await expect(change(recipient)).toHaveAttribute(
		'data-amount',
		String(raw),
	);
	await expect(change(account)).toHaveAttribute(
		'data-amount',
		String(-raw),
	);

	await proposeAndSign(page);
	const ready = page.locator(
		'[data-testid="proposal-page"][data-status="ready"]',
	);
	const digest = await ready.getAttribute('data-digest');
	await ready
		.getByTestId('execute-proposal-button')
		.click();
	await expect(
		page.locator(
			`[data-testid="proposal-page"][data-digest="${digest}"]`,
		),
	).toHaveAttribute('data-status', 'executed');

	expect(await chain.balance(recipient, coinType)).toBe(
		raw,
	);
	expect(await chain.balance(account, coinType)).toBe(left);
}

// For each coin, the coins minted, an amount one decimal past its limit
// (refused) and one exactly at it (sent, as `raw`). A 0-decimal coin
// takes whole, grouped amounts; 18 decimals is past what a float holds
// exactly.
const COINS: {
	decimals: number;
	symbol: string;
	minted: bigint[];
	tooPrecise: string;
	amount: string;
	raw: bigint;
}[] = [
	{
		decimals: 0,
		symbol: 'ZERO',
		minted: [5_000n],
		tooPrecise: '1.5',
		amount: '1,000',
		raw: 1_000n,
	},
	// 10 WEI; a u64 holds at most about 18.4 of an 18-decimal coin.
	{
		decimals: 18,
		symbol: 'WEI',
		minted: [10n ** 19n],
		tooPrecise: '0.1234567890123456789',
		amount: '0.123456789012345678',
		raw: 123_456_789_012_345_678n,
	},
];

test.describe('transfer: coins with other decimals', () => {
	// Each test proposes and executes, the first once per coin.
	test.slow();

	test('each coin takes up to its own decimals and sends exactly what was typed', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { page, account, coinTypes } =
			await accountWithCoins(
				{ createActor, createIdentity, chain },
				COINS.map(({ decimals, symbol, minted }) => ({
					minted,
					metadata: coin(decimals, symbol),
				})),
			);

		for (const [
			i,
			{ decimals, minted, tooPrecise, amount, raw },
		] of COINS.entries()) {
			await test.step(`${decimals} decimals`, async () => {
				const coinType = coinTypes[i];
				const recipient = randomAddress();
				await openNewProposal(page, account, {
					type: 'transfer',
				});
				await fillTransfer(page, {
					coinType,
					amount: tooPrecise,
					recipient,
				});
				await expectAmount(
					page,
					content.newProposal.invalidAmount(decimals),
				);
				await fillTransfer(page, { amount, recipient });
				await expectAmount(page, null);
				await proposeAndExecute(page, chain, {
					account,
					coinType,
					recipient,
					raw,
					left:
						minted.reduce((sum, m) => sum + m, 0n) - raw,
				});
			});
		}
	});

	test('an 18-decimal coin sends a single raw unit, and Max then sends the whole balance left but not one raw unit more', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const minted = 1_234_567_891_234_567_891n;
		const {
			page,
			account,
			coinTypes: [coinType],
		} = await accountWithCoins(
			{ createActor, createIdentity, chain },
			[{ minted: [minted], metadata: coin(18, 'WEI') }],
		);
		const recipient = randomAddress();

		await openNewProposal(page, account, {
			type: 'transfer',
		});
		await fillTransfer(page, {
			coinType,
			amount: '0.000000000000000001',
			recipient,
		});
		await expectAmount(page, null);
		await proposeAndExecute(page, chain, {
			account,
			coinType,
			recipient,
			raw: 1n,
			left: minted - 1n,
		});

		const other = randomAddress();
		await openNewProposal(page, account, {
			type: 'transfer',
		});
		await fillTransfer(page, {
			coinType,
			amount: '1.234567891234567891',
			recipient: other,
		});
		await expectAmount(
			page,
			content.newProposal.overBalance(
				'WEI',
				'1.23456789123456789',
			),
		);
		await page.getByTestId('transfer-max-button').click();
		await expect(
			page.getByTestId('transfer-amount-input'),
		).toHaveValue('1.23456789123456789');
		await expectAmount(page, null);
		await proposeAndExecute(page, chain, {
			account,
			coinType,
			recipient: other,
			raw: minted - 1n,
			left: 0n,
		});
	});
});
