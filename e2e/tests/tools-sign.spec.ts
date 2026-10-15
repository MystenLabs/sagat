// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MIST_PER_SUI } from '@mysten/sui/utils';

import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';

// The Transaction Signer tool at /tools/sign: paste transaction bytes, see
// the dry run, then sign (and optionally execute) with the connected wallet.
test.describe('transaction signer tool', () => {
	test('signs a transaction, which then executes on chain', async ({
		createActor,
		chain,
	}) => {
		const alice = await createActor('alice');
		await chain.fund(alice.address);
		const recipient = randomAddress();
		const bytes = await chain.buildSuiTransfer({
			sender: alice.address,
			recipient,
			amount: MIST_PER_SUI,
		});

		// The tool is public: the preview works before a wallet is connected,
		// but signing waits for one.
		await alice.page.goto('/tools/sign');
		await alice.page
			.getByTestId('transaction-data-input')
			.fill(bytes);
		await expect(
			alice.page.getByTestId('transaction-preview-result'),
		).toHaveAttribute('data-result', 'success');
		await expect(
			alice.page.getByTestId('sign-button'),
		).toBeDisabled();
		await expect(
			alice.page.getByTestId('sign-and-execute-button'),
		).toBeDisabled();

		await alice.connectWallet();
		await alice.page.getByTestId('sign-button').click();

		const result = alice.page.getByTestId('signed-result');
		await expect(result).toBeVisible();
		await expect(result).not.toHaveAttribute('data-digest');
		const signature = await result.getAttribute(
			'data-signature',
		);
		expect(signature).toBeTruthy();

		// Nothing was executed yet; the signature is valid for the bytes.
		expect(await chain.balance(recipient)).toBe(0n);
		await chain.execute(bytes, signature!);
		expect(await chain.balance(recipient)).toBe(
			MIST_PER_SUI,
		);

		await alice.page
			.getByTestId('start-over-button')
			.click();
		await expect(result).toHaveCount(0);
		await expect(
			alice.page.getByTestId('transaction-data-input'),
		).toHaveValue('');
	});

	test('signs and executes a transaction', async ({
		createActor,
		chain,
	}) => {
		const alice = await createActor('alice');
		await chain.fund(alice.address);
		const recipient = randomAddress();
		const bytes = await chain.buildSuiTransfer({
			sender: alice.address,
			recipient,
			amount: MIST_PER_SUI,
		});

		await alice.page.goto('/tools/sign');
		await alice.connectWallet();
		await alice.page
			.getByTestId('transaction-data-input')
			.fill(bytes);
		await expect(
			alice.page.getByTestId('transaction-preview-result'),
		).toHaveAttribute('data-result', 'success');
		await alice.page
			.getByTestId('sign-and-execute-button')
			.click();

		const result = alice.page.getByTestId('signed-result');
		await expect(result).toHaveAttribute(
			'data-digest',
			/.+/,
		);
		const digest = await result.getAttribute('data-digest');
		await chain.client.waitForTransaction({
			digest: digest!,
		});
		expect(await chain.balance(recipient)).toBe(
			MIST_PER_SUI,
		);
	});

	test('does not offer to sign a transaction whose dry run fails', async ({
		createActor,
		chain,
	}) => {
		const alice = await createActor('alice');
		await chain.fund(alice.address);
		const bytes = await chain.buildOverdrawnSuiTransfer({
			sender: alice.address,
			recipient: randomAddress(),
		});

		await alice.page.goto('/tools/sign');
		await alice.connectWallet();
		await alice.page
			.getByTestId('transaction-data-input')
			.fill(bytes);
		await expect(
			alice.page.getByTestId('transaction-preview-result'),
		).toHaveAttribute('data-result', 'failure');
		await expect(
			alice.page.getByTestId('sign-button'),
		).toHaveCount(0);
		await expect(
			alice.page.getByTestId('sign-and-execute-button'),
		).toHaveCount(0);
	});
});
