// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';
import {
	formatAddress,
	MIST_PER_SUI,
	normalizeSuiAddress,
} from '@mysten/sui/utils';

import { content } from '../../app/src/content';
import { formatCoinType } from '../../app/src/lib/coin-type';
import { randomAddress, SUI_TYPE } from '../support/chain';
import { E2E } from '../support/env';
import { expect, test } from '../support/fixtures';
import {
	amountError,
	balanceChange,
	bytesToReview,
	chooseAsset,
	chooseType,
	clickNewProposal,
	executeProposal,
	expectOnProposal,
	expectOnProposals,
	expectSimulation,
	fillTransfer,
	isCreateRequest,
	openNewProposal,
	pasteBytes,
	proposeAndSign,
	recordCreates,
	reviewBytes,
	reviewTransfer,
	sharedAccount,
	toast,
} from '../support/new-proposal';
import {
	mintCoin,
	mintTestCoin,
	publishTestCoin,
} from '../support/test-coin';

test.describe('new proposal: type', () => {
	// As Enter would on a native radio in a form.
	test('Enter on a type card continues to that type’s Details', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;

		await openNewProposal(page, multisig.address);
		await page
			.getByTestId('proposal-type-transfer')
			.focus();
		await page.keyboard.press('ArrowDown');
		await expect(
			page.getByTestId('proposal-type-bytes'),
		).toHaveAttribute('data-checked');
		await page.keyboard.press('Enter');
		await expect(
			page.getByTestId('bytes-step'),
		).toBeVisible();
	});
});

test.describe('new proposal: transfer', () => {
	test('proposes a SUI transfer with the generated title, previews the recipient’s balance change and executes', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice } = await sharedAccount(fixtures, 1);
		const { page } = alice;
		const recipient = randomAddress();

		await clickNewProposal(page);
		await chooseType(page, 'transfer');
		await fillTransfer(page, {
			coinType: SUI_TYPE,
			amount: '1.5',
			recipient,
		});
		const titleInput = page.getByTestId(
			'proposal-title-input',
		);
		await expect(titleInput).toHaveValue(
			/^Send 1\.5 SUI to 0x/,
		);
		const title = await titleInput.inputValue();

		await reviewTransfer(page);
		await expect(
			page.getByTestId('new-proposal-stepper'),
		).toHaveAttribute('data-step', '3');
		await expect(
			page.getByTestId('review-title'),
		).toHaveText(title);
		await expectSimulation(page, 'success');
		const change = balanceChange(page, recipient);
		await expect(change).toHaveAttribute(
			'data-amount',
			String((3n * MIST_PER_SUI) / 2n),
		);
		await expect(change).toContainText('+1.5');

		await proposeAndSign(page);
		const card = page.getByTestId('proposal-page');
		// 1-of-2: Alice's signature already meets the threshold.
		await expect(card).toHaveAttribute(
			'data-status',
			'ready',
		);
		await expect(card).toContainText(title);

		await executeProposal(page);
		expect(await chain.balance(recipient)).toBe(
			(3n * MIST_PER_SUI) / 2n,
		);
	});

	test('Review splits the account’s gas out of its SUI change and counts the tabs', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			1,
		);
		const { page } = alice;
		const account = normalizeSuiAddress(multisig.address);

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await fillTransfer(page, {
			coinType: SUI_TYPE,
			amount: '1.5',
			recipient: randomAddress(),
		});
		await reviewTransfer(page);
		await expectSimulation(page, 'success');

		// The account's SUI row is the transfer alone; its net gas, a cost
		// or a rebate, is a row of its own.
		const sent = page.locator(
			`[data-testid="balance-change"][data-address="${account}"]:not([data-gas])`,
		);
		await expect(sent).toHaveAttribute(
			'data-amount',
			String(-(3n * MIST_PER_SUI) / 2n),
		);
		const gas = page.locator(
			`[data-testid="balance-change"][data-address="${account}"][data-gas]`,
		);
		const gasAmount = BigInt(
			(await gas.getAttribute('data-amount')) ?? '0',
		);
		expect(gasAmount).not.toBe(0n);
		const abs = gasAmount < 0n ? -gasAmount : gasAmount;
		expect(abs).toBeLessThan(MIST_PER_SUI / 100n);

		const rows = page.getByTestId('balance-change');
		await expect(
			page.getByTestId(
				'transaction-preview-tab-balance-changes',
			),
		).toHaveAttribute(
			'data-count',
			String(await rows.count()),
		);
		// SplitCoins and TransferObjects.
		await expect(
			page.getByTestId('transaction-preview-tab-commands'),
		).toHaveAttribute('data-count', '2');
		const objectChanges = Number(
			await page
				.getByTestId(
					'transaction-preview-tab-object-changes',
				)
				.getAttribute('data-count'),
		);
		expect(objectChanges).toBeGreaterThan(0);
	});

	test('the Static analyzer tab shows the analyzer and comes back to the simulation', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			1,
		);
		const { page } = alice;

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await fillTransfer(page, {
			coinType: SUI_TYPE,
			amount: '1',
			recipient: randomAddress(),
		});
		await reviewTransfer(page);
		await expectSimulation(page, 'success');

		const status = page.getByTestId(
			'transaction-preview-status',
		);
		await expect(status).toBeVisible();

		await page
			.getByTestId('transaction-preview-view-analyzer')
			.click();
		await expect(status).toBeHidden();
		await expect(
			page.getByTestId('intent-summary'),
		).toBeVisible();

		await page
			.getByTestId('transaction-preview-view-simulation')
			.click();
		await expect(status).toBeVisible();
	});

	test('Send on the SUI asset row opens Details with SUI chosen', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice } = await sharedAccount(fixtures, 2);
		const { page } = alice;

		await page.getByTestId('multisig-tab-assets').click();
		await alice
			.suiBalanceRow()
			.getByTestId('asset-send-button')
			.click();

		await expect(
			page.getByTestId('transfer-step'),
		).toBeVisible();
		await expect(
			page.getByTestId('new-proposal-stepper'),
		).toHaveAttribute('data-step', '2');
		await expect(
			page.getByTestId('transfer-asset-select'),
		).toHaveAttribute('data-coin-type', /::sui::SUI$/);
	});

	// Not proposed: the API 400s on the reservation ref an address balance adds to gasData.payment
	// (extractOwnedObjects in api/src/services/multisig.service.ts). The end-to-end part lands with that fix.
	test('Max fills the coins and the address balance together, and Review shows the expiry', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		// 1,000 SUI in coins, then 300 SUI as an address balance.
		const { alice, multisig } = await sharedAccount(
			fixtures,
			1,
		);
		await chain.fundAddressBalance(
			multisig.address,
			300n * MIST_PER_SUI,
		);
		const funded = 1_300n * MIST_PER_SUI;
		expect(await chain.balance(multisig.address)).toBe(
			funded,
		);
		expect(
			await chain.addressBalance(multisig.address),
		).toBe(300n * MIST_PER_SUI);
		const { page } = alice;
		// Signing in lands on the overview, which read the balance before the address balance was added.
		await page.reload();
		const recipient = randomAddress();

		await page.getByTestId('multisig-tab-assets').click();
		await alice
			.suiBalanceRow()
			.getByTestId('asset-send-button')
			.click();
		const recipientInput = page.getByTestId(
			'transfer-recipient-input',
		);
		await recipientInput.fill(recipient);
		await recipientInput.blur();
		await page.getByTestId('transfer-max-button').click();
		await expect(
			page.getByTestId('transfer-amount-input'),
		).toHaveValue('1300');

		await reviewTransfer(page);
		await expectSimulation(page, 'success');
		// Spending an address balance makes the transaction expire.
		const expiry = page.getByTestId('review-expiry');
		await expect(expiry).toBeVisible();
		await expect(
			expiry.getByTestId('proposal-expiry'),
		).toHaveText(/^Expires in /);
	});

	test('Send on the overview opens Details for a transfer', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice } = await sharedAccount(fixtures, 2);
		const { page } = alice;

		await page.getByTestId('multisig-tab-overview').click();
		await page.getByTestId('overview-send-button').click();

		await expect(
			page.getByTestId('transfer-step'),
		).toBeVisible();
		await expect(
			page.getByTestId('new-proposal-stepper'),
		).toHaveAttribute('data-step', '2');
	});
	// The app's own links pass the long form; people write the short one.
	test('?asset=0x2::sui::SUI preselects SUI like the long form does', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
			coinType: '0x2::sui::SUI',
		});
		await expect(
			page.getByTestId('transfer-asset-select'),
		).toHaveAttribute('data-coin-type', /::sui::SUI$/);
	});

	// One transfer pays gas with at most 256 coins: the node takes the
	// first 256, so Max fills their value and the rest stays.
	test('Max on SUI held in 300 coins fills what one transfer can send and warns about the rest', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			1,
			{ fund: false },
		);
		// 150 SUI, as 300 coins of 0.5.
		await chain.fundWithCoins(multisig.address, {
			count: 300,
			amount: MIST_PER_SUI / 2n,
		});
		const sent = 128n * MIST_PER_SUI;
		const { page } = alice;
		const recipient = randomAddress();

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await chooseAsset(page, SUI_TYPE);
		const amount = page.getByTestId(
			'transfer-amount-input',
		);
		await amount.fill('150');
		await amount.blur();
		await expect(amountError(page)).toHaveText(
			content.newProposal.overMax('128', 'SUI'),
		);
		await page.getByTestId('transfer-max-button').click();
		await expect(amount).toHaveValue('128');
		await expect(amountError(page)).toHaveCount(0);
		await expect(
			page.getByTestId('transfer-max-partial'),
		).toContainText('128');
		const recipientInput = page.getByTestId(
			'transfer-recipient-input',
		);
		await recipientInput.fill(recipient);
		await recipientInput.blur();
		await reviewTransfer(page);
		await expectSimulation(page, 'success');
		await proposeAndSign(page);

		const digest = await executeProposal(page);
		expect(await chain.balance(recipient)).toBe(
			sent - (await chain.gasCost(digest)),
		);
		// The 44 coins past the first 256.
		expect(await chain.balance(multisig.address)).toBe(
			22n * MIST_PER_SUI,
		);
	});
});

test.describe('new proposal: transfer details', () => {
	test('the recipient line marks an address invalid or valid', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;
		const refWarnings: string[] = [];
		page.on('console', (message) => {
			if (
				['warning', 'error'].includes(message.type()) &&
				message
					.text()
					.includes(
						'Function components cannot be given refs',
					)
			)
				refWarnings.push(message.text());
		});

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		const input = page.getByTestId(
			'transfer-recipient-input',
		);
		const status = page.getByTestId(
			'transfer-recipient-status',
		);
		await input.fill('0x1234');
		await input.blur();
		await expect(status).toHaveAttribute(
			'data-state',
			'invalid',
		);
		await expect(status).toContainText(
			'isn’t a valid Sui address',
		);

		await input.fill(randomAddress());
		await expect(status).toHaveAttribute(
			'data-state',
			'valid',
		);
		await expect(status).toHaveText('Valid Sui address');

		await page
			.getByTestId('transfer-recipient-clear')
			.click();
		await expect(input).toHaveValue('');
		await expect(status).toHaveCount(0);
		expect(refWarnings).toEqual([]);
	});

	test('a zero amount asks for an amount above 0', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await fillTransfer(page, {
			coinType: SUI_TYPE,
			amount: '0',
			recipient: randomAddress(),
		});
		await expect(amountError(page)).toHaveText(
			'Enter an amount above 0.',
		);
		await expect(
			page.getByTestId('transfer-review'),
		).toBeDisabled();
	});

	test('closing the asset list without a choice asks for an asset', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		const error = page.getByTestId('transfer-asset-error');
		await expect(
			page.getByTestId('transfer-review'),
		).toBeDisabled();
		await expect(error).toHaveCount(0);

		await page.getByTestId('transfer-asset-select').click();
		await expect(
			page.getByTestId('transfer-asset-option').first(),
		).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(error).toHaveText(
			'Choose an asset to send.',
		);
		await expect(
			page.getByTestId('transfer-review'),
		).toBeDisabled();
	});

	test('clearing the generated title leaves the proposal untitled', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await fillTransfer(page, {
			coinType: SUI_TYPE,
			amount: '1',
			recipient: randomAddress(),
		});
		await expect(
			page.getByTestId('transfer-review'),
		).toBeEnabled();

		await page.getByTestId('proposal-title-input').fill('');
		await expect(
			page.getByTestId('proposal-title-hint'),
		).not.toHaveAttribute('data-state', 'error');
		await reviewTransfer(page);
		await expect(
			page.getByTestId('review-title'),
		).toHaveText('No title');
	});
	test('an account without SUI for gas stays on Details with a message about gas', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
			{ fund: false },
		);
		const testCoin = await mintTestCoin(
			chain,
			multisig.address,
			[5_000_000n],
		);
		const { page } = alice;
		const creates = recordCreates(page);

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await fillTransfer(page, {
			coinType: testCoin,
			amount: '5',
			recipient: randomAddress(),
		});
		await expect(
			page.getByTestId('transfer-no-gas'),
		).toHaveText(
			'This pod has no SUI to pay gas. Send it some SUI before proposing a transfer.',
		);
		const review = page.getByTestId('transfer-review');
		await expect(review).toBeDisabled();
		await review.click({ force: true });
		await expect(
			page.getByTestId('review-step'),
		).toHaveCount(0);
		expect(creates).toHaveLength(0);
	});

	test('zeros past a coin’s decimals are accepted, and a 0-decimal coin asks for a whole number', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		// Before the account: a build blocks the event loop, which would
		// stall requests in flight.
		const tenth = await publishTestCoin(chain, {
			decimals: 1,
			symbol: 'TENTH',
			name: 'Tenth Coin',
		});
		const whole = await publishTestCoin(chain, {
			decimals: 0,
			symbol: 'WHOLE',
			name: 'Whole Coin',
		});
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const [tenthType, wholeType] = await Promise.all([
			mintCoin(chain, tenth, multisig.address, [100n]),
			mintCoin(chain, whole, multisig.address, [10n]),
		]);
		const { page } = alice;
		const recipient = randomAddress();

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await fillTransfer(page, {
			coinType: tenthType,
			amount: '1.50',
			recipient,
		});
		await expect(amountError(page)).toHaveCount(0);
		await reviewTransfer(page);
		await expectSimulation(page, 'success');
		await expect(
			balanceChange(page, recipient),
		).toHaveAttribute('data-amount', '15');

		await page.getByTestId('review-back').click();
		await fillTransfer(page, {
			coinType: wholeType,
			amount: '1.5',
			recipient,
		});
		await expect(amountError(page)).toHaveText(
			'Enter a whole number.',
		);
		await expect(
			page.getByTestId('transfer-review'),
		).toBeDisabled();
		await fillTransfer(page, { amount: '7.0', recipient });
		await expect(amountError(page)).toHaveCount(0);
		await expect(
			page.getByTestId('transfer-review'),
		).toBeEnabled();
	});

	// Blank metadata is read like none: the compact type stands in for the
	// symbol, so the coin isn't shown or titled as nothing.
	test('a coin without a symbol or name is labelled by its type', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		// Before the account: a build blocks the event loop.
		const coin = await publishTestCoin(chain, {
			decimals: 6,
			symbol: '',
			name: '',
		});
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const coinType = await mintCoin(
			chain,
			coin,
			multisig.address,
			[5_000_000n],
		);
		const { page } = alice;
		const recipient = randomAddress();
		const label = formatCoinType(coinType);

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await page.getByTestId('transfer-asset-select').click();
		const option = page.locator(
			`[data-testid="transfer-asset-option"][data-coin-type="${coinType}"]`,
		);
		await expect(option).toContainText(label);
		await option.click();
		await fillTransfer(page, { amount: '1', recipient });
		await expect(
			page.getByTestId('proposal-title-input'),
		).toHaveValue(
			`Send 1 ${label} to ${formatAddress(recipient)}`,
		);
	});
});

test.describe('new proposal: transaction bytes', () => {
	test('bytes that aren’t a transaction, or are sent from another address, are refused', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;
		// Building with the client needs a sender that holds coins.
		const other = randomAddress();
		await chain.fund(other);
		const othersBytes = await chain.buildSuiTransfer({
			sender: other,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
		});

		await openNewProposal(page, multisig.address, {
			type: 'bytes',
		});
		const status = page.getByTestId('bytes-status');
		await pasteBytes(page, 'not a transaction', 'A title');
		await expect(status).toHaveAttribute(
			'data-state',
			'unreadable',
		);
		await expect(
			page.getByTestId('bytes-review'),
		).toBeDisabled();

		await pasteBytes(page, othersBytes);
		await expect(status).toHaveAttribute(
			'data-state',
			'wrong-sender',
		);
		await expect(
			page.getByTestId('bytes-review'),
		).toBeDisabled();
	});

	test('a fully built transaction pasted as JSON is simulated and proposed as its bytes', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;
		const creates = recordCreates(page);
		const bytes = await chain.buildSuiTransfer({
			sender: multisig.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
		});

		await openNewProposal(page, multisig.address, {
			type: 'bytes',
		});
		await pasteBytes(
			page,
			await Transaction.from(bytes).toJSON(),
			'Pasted as JSON',
		);
		await expect(
			page.getByTestId('bytes-status'),
		).toHaveAttribute('data-state', 'ok');
		await reviewBytes(page);
		await expectSimulation(page, 'success');
		await proposeAndSign(page);
		expect(
			creates.map((r) => r.postDataJSON().transactionBytes),
		).toEqual([bytes]);
	});
});

test.describe('new proposal: review', () => {
	test('a failed create shows the notice, and Try again creates it', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;
		const createProposal = (url: URL) =>
			url.pathname.endsWith('/proposals');
		// The API's error shape: `{ error }` with the status.
		const refuseCreate = (status: number, error: string) =>
			page.route(createProposal, (route) =>
				isCreateRequest(route.request())
					? route.fulfill({
							status,
							json: { error },
							headers: {
								'access-control-allow-origin': E2E.appUrl,
								'access-control-allow-credentials': 'true',
							},
						})
					: route.fallback(),
			);
		const reused =
			'These owned/receiving objects are already used by pending proposals: 0xabc';
		await refuseCreate(400, reused);

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await fillTransfer(page, {
			coinType: SUI_TYPE,
			amount: '1',
			recipient: randomAddress(),
		});
		await reviewTransfer(page);
		await expectSimulation(page, 'success');
		const submit = page.getByTestId('review-submit');
		const createError = page.getByTestId(
			'review-create-error',
		);
		// A refusal shows the API's reason.
		await submit.click();
		await expect(createError).toHaveText(reused);
		await expect(submit).toHaveText('Try again');

		// Anything else shows the general notice.
		await page.unroute(createProposal);
		await refuseCreate(500, 'Internal server error');
		await submit.click();
		await expect(createError).toHaveText(
			'Pods couldn’t create the proposal. Nothing was sent to the other signers. Check your connection and try again.',
		);
		await expect(submit).toHaveText('Try again');

		await page.unroute(createProposal);
		await proposeAndSign(page);
		await expect(
			page.getByTestId('proposal-page'),
		).toHaveAttribute('data-status', 'pending');
	});

	test('Cancel returns to the proposals', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;

		await clickNewProposal(page);
		await chooseType(page, 'transfer');
		await page.getByTestId('new-proposal-cancel').click();
		await expectOnProposals(page, multisig.address);
	});

	test('Back from Review keeps the filled details', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;
		const recipient = randomAddress();

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await fillTransfer(page, {
			coinType: SUI_TYPE,
			amount: '2.25',
			recipient,
			title: 'Pay the designer',
		});
		await reviewTransfer(page);
		await page.getByTestId('review-back').click();

		await expect(
			page.getByTestId('transfer-step'),
		).toBeVisible();
		await expect(
			page.getByTestId('transfer-asset-select'),
		).toHaveAttribute('data-coin-type', /::sui::SUI$/);
		await expect(
			page.getByTestId('transfer-amount-input'),
		).toHaveValue('2.25');
		await expect(
			page.getByTestId('transfer-recipient-input'),
		).toHaveValue(recipient);
		await expect(
			page.getByTestId('proposal-title-input'),
		).toHaveValue('Pay the designer');
		await reviewTransfer(page);
		await expect(
			page.getByTestId('review-title'),
		).toHaveText('Pay the designer');
	});
	// Propose is only disabled once React re-renders with the create
	// pending, so a second click can come before that.
	test('two clicks on Propose in the same tick send one POST /proposals', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;
		const creates = recordCreates(page);
		await bytesToReview(
			page,
			chain,
			multisig.address,
			'Once',
		);

		await page
			.getByTestId('review-submit')
			.evaluate((button: HTMLButtonElement) => {
				button.click();
				button.click();
			});
		await expectOnProposal(page, multisig.address);
		// Let a second create, if any, reach the network.
		await page.waitForTimeout(2_000);
		expect(creates).toHaveLength(1);
	});

	test('while the proposal is being created, Back, Cancel, the stepper and the title pen are disabled', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;
		await bytesToReview(
			page,
			chain,
			multisig.address,
			'Held',
		);

		// Hold the create until the checks are done.
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route(
			(url) => url.pathname.endsWith('/proposals'),
			async (route) => {
				if (isCreateRequest(route.request())) await held;
				await route.fallback();
			},
		);

		const submit = page.getByTestId('review-submit');
		await submit.click();
		await expect(submit).toHaveText('Creating proposal…');
		// The title was read when Propose was clicked, so an edit now
		// wouldn't be part of the proposal.
		for (const id of [
			'review-submit',
			'review-back',
			'new-proposal-cancel',
			'new-proposal-cancel-footer',
			'new-proposal-step-1',
			'new-proposal-step-2',
			'review-edit-title',
		])
			await expect(page.getByTestId(id)).toBeDisabled();

		release();
		await expectOnProposal(page, multisig.address);
		await expect(
			toast(page, 'success').filter({
				hasText: 'Proposal created',
			}),
		).toBeVisible();
	});

	test('a declined signature shows the toast and stays on Review, ready to retry, without sending anything', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
			{ rejectSigning: true },
		);
		const { page } = alice;
		const creates = recordCreates(page);
		await bytesToReview(
			page,
			chain,
			multisig.address,
			'Declined',
		);

		const submit = page.getByTestId('review-submit');
		await submit.click();
		await expect(
			toast(page, 'error').filter({
				hasText:
					'The wallet didn’t sign the proposal. Nothing was created.',
			}),
		).toBeVisible();
		await expect(
			page.getByTestId('review-step'),
		).toBeVisible();
		await expect(submit).toBeEnabled();
		expect(creates).toHaveLength(0);
	});

	// The length check counts code points after NFC, and the API stores the
	// title in a varchar(1000) without a check of its own, so the title is
	// sent in its NFC form.
	test('a 500-character title that is longer before NFC is proposed in its NFC form', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await sharedAccount(
			fixtures,
			2,
		);
		const { page } = alice;
		const creates = recordCreates(page);
		// 각 typed as three conjoining jamo: 1,500 code points, 500 after NFC.
		const title = '각'.repeat(500);

		await bytesToReview(
			page,
			chain,
			multisig.address,
			title,
		);
		await proposeAndSign(page);
		expect(
			creates.map((r) => r.postDataJSON().description),
		).toEqual([title.normalize('NFC')]);
	});
});
