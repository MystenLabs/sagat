// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MIST_PER_SUI } from '@mysten/sui/utils';
import { type Page } from '@playwright/test';

import { type Actor } from '../support/actor';
import {
	randomAddress,
	SUI_TYPE,
	type Chain,
} from '../support/chain';
import { E2E } from '../support/env';
import { expect, test } from '../support/fixtures';
import { type Identity } from '../support/identity';
import {
	chooseAsset,
	chooseType,
	clickNewProposal,
	expectOnProposals,
	expectSimulation,
	fillTransfer,
	openNewProposal,
	pasteBytes,
	proposeAndSign,
	reviewTransfer,
} from '../support/new-proposal';
import { setupMultisig } from '../support/scenarios';

// Alice and Bob share a funded account; Alice is signed in on it. With
// threshold 1, Alice's proposal is ready to execute as soon as she makes it.
async function fundedAccount(
	{
		createActor,
		createIdentity,
		chain,
	}: {
		createActor: (name: string) => Promise<Actor>;
		createIdentity: (name: string) => Identity;
		chain: Chain;
	},
	threshold: 1 | 2,
) {
	const alice = await createActor('alice');
	const bob = createIdentity('bob');
	const multisig = await setupMultisig({
		creator: alice,
		members: [bob],
		threshold,
	});
	await chain.fund(multisig.address);
	await alice.signIn();
	return { alice, bob, multisig };
}

function balanceChange(page: Page, address: string) {
	return page.locator(
		`[data-testid="balance-change"][data-address="${address}"]`,
	);
}

// Executes the one proposal on the page and returns its digest.
async function executeProposal(page: Page) {
	const card = page.getByTestId('proposal-card');
	await expect(card).toHaveAttribute(
		'data-status',
		'ready',
	);
	await card.getByTestId('execute-proposal-button').click();
	await expect(card).toHaveAttribute(
		'data-status',
		'executed',
	);
	return (await card.getAttribute('data-digest'))!;
}

test.describe('new proposal: transfer', () => {
	test('proposes a SUI transfer with the generated title, previews the recipient’s balance change and executes', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice } = await fundedAccount(fixtures, 1);
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
		const card = page.getByTestId('proposal-card');
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

	test('Send on the SUI asset row opens Details with SUI chosen', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice } = await fundedAccount(fixtures, 2);
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
		const { alice, multisig } = await fundedAccount(
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
		const { alice } = await fundedAccount(fixtures, 2);
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
});

test.describe('new proposal: transfer details', () => {
	test('Max on SUI fills the whole balance', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await fundedAccount(
			fixtures,
			2,
		);
		const { page } = alice;

		await openNewProposal(page, multisig.address, {
			type: 'transfer',
		});
		await chooseAsset(page, SUI_TYPE);
		await page.getByTestId('transfer-max-button').click();

		// The faucet sent 1,000 SUI; nothing is kept back for gas.
		await expect(
			page.getByTestId('transfer-amount-input'),
		).toHaveValue('1000');
		await expect(
			page.getByTestId('transfer-gas-note'),
		).toHaveCount(0);
		await expect(
			page.getByTestId('transfer-amount-error'),
		).toHaveCount(0);
	});

	test('the recipient line marks an address invalid or valid', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await fundedAccount(
			fixtures,
			2,
		);
		const { page } = alice;

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
	});

	test('a zero amount asks for an amount above 0', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await fundedAccount(
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
		await expect(
			page.getByTestId('transfer-amount-error'),
		).toHaveText('Enter an amount above 0.');
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
		const { alice, multisig } = await fundedAccount(
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

	test('clearing the generated title shows its error and blocks Review', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await fundedAccount(
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
		const hint = page.getByTestId('proposal-title-hint');
		await expect(hint).toHaveAttribute(
			'data-state',
			'error',
		);
		await expect(hint).toHaveText(
			'Add a title so signers know what this proposal is for.',
		);
		await expect(
			page.getByTestId('transfer-review'),
		).toBeDisabled();
	});
});

test.describe('new proposal: transaction bytes', () => {
	test('bytes that aren’t a transaction, or are sent from another address, are refused', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await fundedAccount(
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
});

test.describe('new proposal: review', () => {
	test('a failed create shows the notice, and Try again creates it', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await fundedAccount(
			fixtures,
			2,
		);
		const { page } = alice;
		const createProposal = (url: URL) =>
			url.pathname.endsWith('/proposals');
		await page.route(createProposal, (route) =>
			route.request().method() === 'POST'
				? route.fulfill({
						status: 500,
						json: { error: 'Internal server error' },
						headers: {
							'access-control-allow-origin': E2E.appUrl,
							'access-control-allow-credentials': 'true',
						},
					})
				: route.fallback(),
		);

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
		await submit.click();
		await expect(
			page.getByTestId('review-create-error'),
		).toHaveText(
			'Couldn’t create the proposal. Nothing was sent to the other signers. Check your connection and try again.',
		);
		await expect(submit).toHaveText('Try again');

		await page.unroute(createProposal);
		await proposeAndSign(page);
		await expect(
			page.getByTestId('proposal-card'),
		).toHaveAttribute('data-status', 'pending');
	});

	test('Cancel returns to the proposals', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice } = await fundedAccount(fixtures, 2);
		const { page } = alice;

		await clickNewProposal(page);
		await chooseType(page, 'transfer');
		await page.getByTestId('new-proposal-cancel').click();
		await expectOnProposals(page);
	});

	test('Back from Review keeps the filled details', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const fixtures = { createActor, createIdentity, chain };
		const { alice, multisig } = await fundedAccount(
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
});
