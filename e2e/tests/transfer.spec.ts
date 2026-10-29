// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';
import {
	amountError,
	chooseAsset,
	chooseType,
	clickNewProposal,
	expectSimulation,
	fillTransfer,
	proposeAndSign,
	reviewTransfer,
} from '../support/new-proposal';
import { setupMultisig } from '../support/scenarios';
import { mintTestCoin } from '../support/test-coin';

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
		const coinType = await mintTestCoin(
			chain,
			multisig.address,
			[10_000_000n],
		);

		await alice.signIn();
		await alice.page
			.getByTestId('multisig-tab-assets')
			.click();
		await alice
			.suiBalanceRow()
			.getByTestId('asset-send-button')
			.click();
		// The faucet sent 1,000 SUI.
		await fillTransfer(alice.page, {
			amount: '5000',
			recipient: randomAddress(),
		});

		const error = amountError(alice.page);
		await expect(error).toBeVisible();
		await expect(error).toHaveText(
			'More than the account holds. The SUI balance is 1,000.',
		);
		await expect(
			alice.page.getByTestId('transfer-review'),
		).toBeDisabled();
		await expect(
			alice.page.getByTestId('transaction-preview-result'),
		).toHaveCount(0);

		// Any other coin names its balance.
		await fillTransfer(alice.page, {
			coinType,
			amount: '50',
			recipient: randomAddress(),
		});
		await expect(error).toHaveText(
			'More than the account holds. The TEST balance is 10.',
		);
		await expect(
			alice.page.getByTestId('transfer-review'),
		).toBeDisabled();
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
		await alice.page
			.getByTestId('transfer-recipient-input')
			.fill(recipient);
		await alice.page
			.getByTestId('transfer-max-button')
			.click();
		await reviewTransfer(alice.page);
		await expectSimulation(alice.page, 'success');
		await proposeAndSign(alice.page);

		const card = alice.page.getByTestId('proposal-row');
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

	test('sends a coin other than SUI, picked in the panel', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 1,
		});
		await chain.fund(multisig.address);
		// 10 TEST in each of three coins, so sending 12.5 merges coins.
		const coinType = await mintTestCoin(
			chain,
			multisig.address,
			[10_000_000n, 10_000_000n, 10_000_000n],
		);
		const recipient = randomAddress();

		await alice.signIn();
		await clickNewProposal(alice.page);
		await chooseType(alice.page, 'transfer');
		await chooseAsset(alice.page, coinType);
		await fillTransfer(alice.page, {
			amount: '12.5',
			recipient,
		});
		await reviewTransfer(alice.page);
		await expectSimulation(alice.page, 'success');
		await proposeAndSign(alice.page);

		const card = alice.page.getByTestId('proposal-row');
		await card
			.getByTestId('execute-proposal-button')
			.click();
		await expect(card).toHaveAttribute(
			'data-status',
			'executed',
		);

		expect(await chain.balance(recipient, coinType)).toBe(
			12_500_000n,
		);
		expect(
			await chain.balance(multisig.address, coinType),
		).toBe(17_500_000n);
	});
});
