// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';
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

		await alice.connectWallet({ signIn: false });
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

	// JSON without gas does not build offline, so the tool previews the
	// dry run's resolved bytes; it must sign those, not re-resolve the JSON.
	test('signs the bytes it previewed when the input is JSON', async ({
		createActor,
		chain,
	}) => {
		const alice = await createActor('alice');
		await chain.fund(alice.address);
		const recipient = randomAddress();
		const tx = new Transaction();
		tx.setSender(alice.address);
		const [coin] = tx.splitCoins(tx.gas, [MIST_PER_SUI]);
		tx.transferObjects([coin], recipient);

		await alice.page.goto('/tools/sign');
		await alice.connectWallet({ signIn: false });
		await alice.page
			.getByTestId('transaction-data-input')
			.fill(await tx.toJSON());
		await expect(
			alice.page.getByTestId('transaction-preview-result'),
		).toHaveAttribute('data-result', 'success');
		await alice.page
			.getByTestId('transaction-preview-raw-toggle')
			.click();
		const previewedBytes = await alice.page
			.getByTestId('transaction-preview-raw')
			.inputValue();
		expect(previewedBytes).toBeTruthy();

		await alice.page.getByTestId('sign-button').click();
		const signature = await alice.page
			.getByTestId('signed-result')
			.getAttribute('data-signature');
		expect(signature).toBeTruthy();

		await chain.execute(previewedBytes, signature!);
		expect(await chain.balance(recipient)).toBe(
			MIST_PER_SUI,
		);
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
		await alice.connectWallet({ signIn: false });
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

	test('shows a transaction that executes but fails on chain as failed', async ({
		createActor,
		chain,
	}) => {
		const alice = await createActor('alice');
		await chain.fund(alice.address);
		const recipient = randomAddress();

		await alice.page.goto('/tools/sign');
		await alice.connectWallet({ signIn: false });
		const bytes = await chain.buildSuiTransferFailingAfter({
			sender: alice.address,
			recipient,
			seconds: 10,
		});
		await alice.page
			.getByTestId('transaction-data-input')
			.fill(bytes);
		await expect(
			alice.page.getByTestId('transaction-preview-result'),
		).toHaveAttribute('data-result', 'success');

		await expect
			.poll(() => chain.dryRunSucceeds(bytes), {
				message: 'the transfer starts to fail',
				timeout: 30_000,
			})
			.toBe(false);
		await alice.page
			.getByTestId('sign-and-execute-button')
			.click();

		// It executed, so it has a digest, but it failed.
		const result = alice.page.getByTestId('signed-result');
		await expect(result).toHaveAttribute(
			'data-result',
			'failure',
		);
		await expect(result).toHaveAttribute(
			'data-digest',
			/.+/,
		);
		await expect(
			result.getByTestId('signed-result-error'),
		).toContainText('InsufficientCoinBalance');
		expect(await chain.balance(recipient)).toBe(0n);
	});

	// The tools offer devnet, which the rest of the app refuses. Leaving it
	// from that refusal page must stick, or every reload lands back there.
	test('switching away from devnet survives a reload', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');
		const { page } = alice;

		// No wallet is connected: the test wallet only has localnet, so the
		// menu disables devnet once it is.
		await page.goto('/tools/sign');
		await page.getByTestId('tool-network-button').click();
		await page
			.getByRole('menuitem', { name: 'devnet' })
			.click();
		await expect(
			page.getByTestId('tool-network-button'),
		).toHaveAttribute('data-network', 'devnet');

		await page.goto('/');
		const devnetNotSupported = page.getByTestId(
			'devnet-not-supported',
		);
		await expect(devnetNotSupported).toBeVisible();
		await page
			.getByTestId('switch-to-testnet-button')
			.click();
		await expect(
			page.getByTestId('connect-wallet-prompt'),
		).toBeVisible();

		await page.reload();
		await expect(
			page.getByTestId('connect-wallet-prompt'),
		).toBeVisible();
		await expect(devnetNotSupported).toHaveCount(0);
		expect(
			await page.evaluate(() =>
				localStorage.getItem('SuiNetwork'),
			),
		).toBe('testnet');
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
		await alice.connectWallet({ signIn: false });
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
