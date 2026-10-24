// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Transfers of coins with 0 to 18 decimals through the wizard: what the
// amount field accepts, the generated title, Review's balance change, and
// the raw amounts that land on chain.
import { formatAddress } from '@mysten/sui/utils';
import { type Page } from '@playwright/test';

import { type Actor } from '../support/actor';
import {
	randomAddress,
	SUI_TYPE,
	type Chain,
} from '../support/chain';
import { expect, test } from '../support/fixtures';
import { type Identity } from '../support/identity';
import {
	chooseAsset,
	expectSimulation,
	fillTransfer,
	openNewProposal,
	proposeAndSign,
	reviewTransfer,
} from '../support/new-proposal';
import { setupMultisig } from '../support/scenarios';
import {
	mintCoin,
	mintTestCoin,
	publishTestCoin,
	type CoinMetadata,
} from '../support/test-coin';

type Fixtures = {
	createActor: (name: string) => Promise<Actor>;
	createIdentity: (name: string) => Identity;
	chain: Chain;
};

// Alice and Bob share an account holding SUI for gas and one coin per
// amount in `minted` of a coin with `metadata` (TEST when it is omitted).
// 1-of-2, so Alice's proposals are ready to execute as soon as she makes
// them. Alice is signed in.
async function accountWithCoin(
	{ createActor, createIdentity, chain }: Fixtures,
	minted: bigint[],
	metadata?: CoinMetadata,
) {
	const [alice, coin] = await Promise.all([
		createActor('alice'),
		metadata ? publishTestCoin(chain, metadata) : null,
	]);
	const multisig = await setupMultisig({
		creator: alice,
		members: [createIdentity('bob')],
		threshold: 1,
	});
	await chain.fund(multisig.address);
	const coinType = coin
		? await mintCoin(chain, coin, multisig.address, minted)
		: await mintTestCoin(chain, multisig.address, minted);
	await alice.signIn();
	return { alice, multisig, coinType };
}

// Opens Details for a transfer of `coinType` and fills it.
async function fillCoinTransfer(
	page: Page,
	account: string,
	transfer: {
		coinType: string;
		amount: string;
		recipient: string;
	},
) {
	await openNewProposal(page, account, {
		type: 'transfer',
	});
	await fillTransfer(page, transfer);
}

function amountError(page: Page) {
	return page.getByTestId('transfer-amount-error');
}

async function expectAmountRefused(
	page: Page,
	error: string,
) {
	await expect(amountError(page)).toHaveText(error);
	await expect(
		page.getByTestId('transfer-review'),
	).toBeDisabled();
}

async function expectAmountAccepted(page: Page) {
	await expect(amountError(page)).toHaveCount(0);
	await expect(
		page.getByTestId('transfer-review'),
	).toBeEnabled();
}

function balanceChange(
	page: Page,
	address: string,
	coinType: string,
) {
	return page.locator(
		`[data-testid="balance-change"][data-address="${address}"][data-coin-type="${coinType}"]`,
	);
}

/**
 * From a filled Details step: checks the generated title, then on Review
 * that the recipient gains `raw` (shown as `shown`) and the account loses
 * it, proposes and executes.
 */
async function proposeAndExecute(
	page: Page,
	{
		account,
		coinType,
		recipient,
		symbol,
		shown,
		raw,
	}: {
		account: string;
		coinType: string;
		recipient: string;
		symbol: string;
		shown: string;
		raw: bigint;
	},
) {
	const title = `Send ${shown} ${symbol} to ${formatAddress(recipient)}`;
	await expect(
		page.getByTestId('proposal-title-input'),
	).toHaveValue(title);

	await reviewTransfer(page);
	await expect(page.getByTestId('review-title')).toHaveText(
		title,
	);
	await expectSimulation(page, 'success');
	const received = balanceChange(page, recipient, coinType);
	await expect(received).toHaveAttribute(
		'data-amount',
		String(raw),
	);
	await expect(received).toContainText(`+${shown}`);
	await expect(
		balanceChange(page, account, coinType),
	).toHaveAttribute('data-amount', String(-raw));

	await proposeAndSign(page);
	const ready = page.locator(
		'[data-testid="proposal-card"][data-status="ready"]',
	);
	await expect(ready).toHaveCount(1);
	await expect(ready).toContainText(title);
	const digest = await ready.getAttribute('data-digest');
	await ready
		.getByTestId('execute-proposal-button')
		.click();
	await expect(
		page.locator(
			`[data-testid="proposal-card"][data-digest="${digest}"]`,
		),
	).toHaveAttribute('data-status', 'executed');
}

// For each coin: an amount with one decimal too many, then a fractional
// amount with exactly its decimals (none for a 0-decimal coin) and a
// whole one, both sent. Zeros past the decimals change nothing, so the
// 0-decimal coin's whole amount is typed with one.
const COINS: {
	decimals: number;
	symbol: string;
	minted: bigint;
	tooPrecise: string;
	sends: { amount: string; shown: string; raw: bigint }[];
}[] = [
	{
		decimals: 0,
		symbol: 'ZERO',
		minted: 5_000n,
		tooPrecise: '1.5',
		sends: [
			{ amount: '1,000', shown: '1,000', raw: 1_000n },
			{ amount: '7.0', shown: '7', raw: 7n },
		],
	},
	{
		decimals: 2,
		symbol: 'CENT',
		minted: 100_000n,
		tooPrecise: '12.345',
		sends: [
			{ amount: '12.34', shown: '12.34', raw: 1_234n },
			{ amount: '3', shown: '3', raw: 300n },
		],
	},
	{
		decimals: 6,
		symbol: 'TEST',
		minted: 100_000_000n,
		tooPrecise: '1.2345678',
		sends: [
			{
				amount: '1.234567',
				shown: '1.234567',
				raw: 1_234_567n,
			},
			{ amount: '7', shown: '7', raw: 7_000_000n },
		],
	},
	{
		decimals: 9,
		symbol: 'NANO',
		minted: 100_000_000_000n,
		tooPrecise: '1.1234567891',
		sends: [
			{
				amount: '1.123456789',
				shown: '1.123456789',
				raw: 1_123_456_789n,
			},
			{ amount: '5', shown: '5', raw: 5_000_000_000n },
		],
	},
	{
		decimals: 18,
		symbol: 'WEI',
		// 10 WEI; a u64 holds at most about 18.4 of an 18-decimal coin.
		minted: 10n ** 19n,
		tooPrecise: '0.1234567890123456789',
		sends: [
			{
				amount: '0.123456789012345678',
				shown: '0.123456789012345678',
				raw: 123_456_789_012_345_678n,
			},
			{ amount: '2', shown: '2', raw: 2n * 10n ** 18n },
		],
	},
];

test.describe('transfer: coins with other decimals', () => {
	// Each test proposes and executes, some twice.
	test.slow();

	for (const coin of COINS) {
		test(`a ${coin.decimals}-decimal coin takes up to ${coin.decimals} decimals and sends what was typed`, async ({
			createActor,
			createIdentity,
			chain,
		}) => {
			const { alice, multisig, coinType } =
				await accountWithCoin(
					{ createActor, createIdentity, chain },
					[coin.minted],
					// TEST is published in global setup.
					coin.symbol === 'TEST'
						? undefined
						: {
								decimals: coin.decimals,
								symbol: coin.symbol,
								name: `${coin.symbol} Coin`,
							},
				);
			const { page } = alice;
			const recipient = randomAddress();

			await fillCoinTransfer(page, multisig.address, {
				coinType,
				amount: coin.tooPrecise,
				recipient,
			});
			await expectAmountRefused(
				page,
				coin.decimals === 0
					? 'Enter a whole number.'
					: `Enter a valid amount (up to ${coin.decimals} decimals).`,
			);

			for (const send of coin.sends) {
				await fillCoinTransfer(page, multisig.address, {
					coinType,
					amount: send.amount,
					recipient,
				});
				await expectAmountAccepted(page);
				await proposeAndExecute(page, {
					account: multisig.address,
					coinType,
					recipient,
					symbol: coin.symbol,
					shown: send.shown,
					raw: send.raw,
				});
			}

			const sent = coin.sends.reduce(
				(sum, send) => sum + send.raw,
				0n,
			);
			expect(await chain.balance(recipient, coinType)).toBe(
				sent,
			);
			expect(
				await chain.balance(multisig.address, coinType),
			).toBe(coin.minted - sent);
		});
	}

	test('the whole balance of a coin can be sent, one raw unit more is refused', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const minted = 1_234_567_891_234_567_891n;
		const { alice, multisig, coinType } =
			await accountWithCoin(
				{ createActor, createIdentity, chain },
				[minted],
				{ decimals: 18, symbol: 'WEI', name: 'Wei Coin' },
			);
		const { page } = alice;
		const recipient = randomAddress();

		await fillCoinTransfer(page, multisig.address, {
			coinType,
			amount: '1.234567891234567892',
			recipient,
		});
		await expectAmountRefused(
			page,
			'More than the account holds. The WEI balance is 1.234567891234567891.',
		);

		// Max fills exactly the balance.
		await page.getByTestId('transfer-max-button').click();
		await expect(
			page.getByTestId('transfer-amount-input'),
		).toHaveValue('1.234567891234567891');
		await expectAmountAccepted(page);
		await proposeAndExecute(page, {
			account: multisig.address,
			coinType,
			recipient,
			symbol: 'WEI',
			shown: '1.234567891234567891',
			raw: minted,
		});

		expect(await chain.balance(recipient, coinType)).toBe(
			minted,
		);
		expect(
			await chain.balance(multisig.address, coinType),
		).toBe(0n);
	});

	test('an 18-decimal coin sends a single raw unit', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig, coinType } =
			await accountWithCoin(
				{ createActor, createIdentity, chain },
				[10n ** 18n],
				{ decimals: 18, symbol: 'WEI', name: 'Wei Coin' },
			);
		const { page } = alice;
		const recipient = randomAddress();

		await fillCoinTransfer(page, multisig.address, {
			coinType,
			amount: '0.000000000000000001',
			recipient,
		});
		await expectAmountAccepted(page);
		await proposeAndExecute(page, {
			account: multisig.address,
			coinType,
			recipient,
			symbol: 'WEI',
			shown: '0.000000000000000001',
			raw: 1n,
		});

		expect(await chain.balance(recipient, coinType)).toBe(
			1n,
		);
		expect(
			await chain.balance(multisig.address, coinType),
		).toBe(10n ** 18n - 1n);
	});

	test('a grouped amount is read without its commas, and the balance is shown grouped', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		// 1,234,567.89 CENT.
		const minted = 123_456_789n;
		const { alice, multisig, coinType } =
			await accountWithCoin(
				{ createActor, createIdentity, chain },
				[minted],
				{ decimals: 2, symbol: 'CENT', name: 'Cent Coin' },
			);
		const { page } = alice;
		const recipient = randomAddress();

		await fillCoinTransfer(page, multisig.address, {
			coinType,
			amount: '1,234,567.90',
			recipient,
		});
		await expectAmountRefused(
			page,
			'More than the account holds. The CENT balance is 1,234,567.89.',
		);

		await fillTransfer(page, {
			amount: '1,234.56',
			recipient,
		});
		await expectAmountAccepted(page);
		await proposeAndExecute(page, {
			account: multisig.address,
			coinType,
			recipient,
			symbol: 'CENT',
			shown: '1,234.56',
			raw: 123_456n,
		});

		expect(await chain.balance(recipient, coinType)).toBe(
			123_456n,
		);
		expect(
			await chain.balance(multisig.address, coinType),
		).toBe(minted - 123_456n);
	});

	test('an amount held across ten coins is merged and sent', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		// Ten coins of 1.5 NANO; 12.75 needs nine of them.
		const each = 1_500_000_000n;
		const { alice, multisig, coinType } =
			await accountWithCoin(
				{ createActor, createIdentity, chain },
				Array.from({ length: 10 }, () => each),
				{ decimals: 9, symbol: 'NANO', name: 'Nano Coin' },
			);
		const { page } = alice;
		const recipient = randomAddress();

		await fillCoinTransfer(page, multisig.address, {
			coinType,
			amount: '12.75',
			recipient,
		});
		await expect(
			page.getByTestId('transfer-asset-select'),
		).toContainText('Balance 15');
		await expectAmountAccepted(page);
		await proposeAndExecute(page, {
			account: multisig.address,
			coinType,
			recipient,
			symbol: 'NANO',
			shown: '12.75',
			raw: 12_750_000_000n,
		});

		expect(await chain.balance(recipient, coinType)).toBe(
			12_750_000_000n,
		);
		expect(
			await chain.balance(multisig.address, coinType),
		).toBe(2_250_000_000n);
	});

	// Blank metadata is read like none: the compact type stands in for the
	// symbol, in the asset list, the errors and the generated title.
	test('a coin without a symbol or name is labelled by its type', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const { alice, multisig, coinType } =
			await accountWithCoin(
				{ createActor, createIdentity, chain },
				[5_000_000n],
				{ decimals: 6, symbol: '', name: '' },
			);
		const { page } = alice;
		const recipient = randomAddress();
		// The compact type the wizard shows for a coin it has no details
		// for (`formatCoinType` in app/src/lib/coin-type.ts).
		const [pkg, ...path] = coinType.split('::');
		const label = `${pkg.slice(0, 6)}...${pkg.slice(-8)}::${path.join('::')}`;

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await page.getByTestId('transfer-asset-select').click();
		const option = page.locator(
			`[data-testid="transfer-asset-option"][data-coin-type="${coinType}"]`,
		);
		await expect(option).toContainText('5');
		await expect(option).toContainText(label);
		await option.click();
		await expect(
			page.getByTestId('transfer-asset-select'),
		).toContainText(label);

		await fillTransfer(page, {
			amount: '6',
			recipient,
		});
		await expect(amountError(page)).toHaveText(
			`More than the account holds. The ${label} balance is 5.`,
		);

		await fillTransfer(page, { amount: '1', recipient });
		await expect(
			page.getByTestId('proposal-title-input'),
		).toHaveValue(
			`Send 1 ${label} to ${formatAddress(recipient)}`,
		);
	});

	// BUG: Max sends the gas coin, and the SDK pays gas with at most 256
	// coins (MAX_GAS_PAYMENT_OBJECTS in @mysten/sui's core resolver), so
	// only 256 of the 300 are merged into it: the recipient gets 128 SUI
	// minus gas and the account keeps 22 SUI in 44 coins, while Max said
	// 150. Expected the whole balance sent. Marked failing until the build
	// handles more coins than gas can carry.
	test('Max on SUI held in 300 coins sends all of it and leaves the account at 0', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		test.fail();
		const alice = await createActor('alice');
		const multisig = await setupMultisig({
			creator: alice,
			members: [createIdentity('bob')],
			threshold: 1,
		});
		// 150 SUI, as 300 coins of 0.5.
		const count = 300;
		const each = 500_000_000n;
		await chain.fundWithCoins(multisig.address, {
			count,
			amount: each,
		});
		const total = BigInt(count) * each;
		expect(await chain.balance(multisig.address)).toBe(
			total,
		);
		await alice.signIn();
		const { page } = alice;
		const recipient = randomAddress();

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await chooseAsset(page, SUI_TYPE);
		await page.getByTestId('transfer-max-button').click();
		await expect(
			page.getByTestId('transfer-amount-input'),
		).toHaveValue('150');
		const recipientInput = page.getByTestId(
			'transfer-recipient-input',
		);
		await recipientInput.fill(recipient);
		await recipientInput.blur();
		await reviewTransfer(page);
		await expectSimulation(page, 'success');
		await proposeAndSign(page);

		const ready = page.locator(
			'[data-testid="proposal-card"][data-status="ready"]',
		);
		await expect(ready).toHaveCount(1);
		const digest =
			(await ready.getAttribute('data-digest'))!;
		await ready
			.getByTestId('execute-proposal-button')
			.click();
		await expect(
			page.locator(
				`[data-testid="proposal-card"][data-digest="${digest}"]`,
			),
		).toHaveAttribute('data-status', 'executed');

		expect(await chain.balance(multisig.address)).toBe(0n);
		expect(await chain.balance(recipient)).toBe(
			total - (await chain.gasCost(digest)),
		);
	});
});
