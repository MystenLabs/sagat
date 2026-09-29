// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';
import { setupMultisig } from '../support/scenarios';

test.describe('transfer form', () => {
	test('refuses an amount above the balance', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
		});
		await chain.fund(multisig.address);

		await alice.signIn();
		await alice.page
			.getByTestId('multisig-tab-assets')
			.click();
		await alice
			.suiBalanceRow()
			.getByTestId('asset-send-button')
			.click();
		const sheet = alice.page.getByTestId('proposal-sheet');
		await sheet
			.getByTestId('transfer-recipient-input')
			.fill(randomAddress());
		// The faucet sent 1,000 SUI.
		await sheet
			.getByTestId('transfer-amount-input')
			.fill('5000');
		await sheet
			.getByTestId('transfer-preview-button')
			.click();

		await expect(
			sheet.getByTestId('transfer-amount-error'),
		).toBeVisible();
		await expect(
			sheet.getByTestId('transaction-preview-result'),
		).toHaveCount(0);
		await expect(
			sheet.getByTestId('create-proposal-submit'),
		).toHaveCount(0);
	});

	test('Max sends the whole SUI balance', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		// 1-of-2, so Alice's proposal is ready to execute right away.
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 1,
		});
		await chain.fund(multisig.address);
		const funded = await chain.balance(multisig.address);
		const recipient = randomAddress();

		await alice.signIn();
		await alice.page
			.getByTestId('multisig-tab-assets')
			.click();
		await alice
			.suiBalanceRow()
			.getByTestId('asset-send-button')
			.click();
		const sheet = alice.page.getByTestId('proposal-sheet');
		await sheet
			.getByTestId('transfer-recipient-input')
			.fill(recipient);
		await sheet.getByTestId('transfer-max-button').click();
		await sheet
			.getByTestId('transfer-preview-button')
			.click();
		await expect(
			sheet.getByTestId('transaction-preview-result'),
		).toHaveAttribute('data-result', 'success');
		await sheet
			.getByTestId('create-proposal-submit')
			.click();
		await expect(sheet).toBeHidden();

		await alice.page
			.getByTestId('multisig-tab-proposals')
			.click();
		const card = alice.page.getByTestId('proposal-card');
		await expect(card).toHaveAttribute(
			'data-status',
			'ready',
		);
		await card
			.getByTestId('execute-proposal-button')
			.click();
		await expect(card).toHaveAttribute(
			'data-status',
			'executed',
		);

		// Everything left the multisig; the recipient got it minus gas.
		const digest = await card.getAttribute('data-digest');
		expect(await chain.balance(multisig.address)).toBe(0n);
		expect(await chain.balance(recipient)).toBe(
			funded - (await chain.gasCost(digest!)),
		);
	});
});
