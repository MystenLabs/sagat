// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';
import { MIST_PER_SUI } from '@mysten/sui/utils';
import type { Route } from '@playwright/test';

import type { Actor } from '../support/actor';
import {
	randomAddress,
	type Chain,
} from '../support/chain';
import { expect, test } from '../support/fixtures';

// Pastes the JSON, signs the bytes the preview shows once the dry run
// passes, and executes those bytes with the signature on chain.
async function signPreviewedJson(
	alice: Actor,
	chain: Chain,
	{
		json,
		recipient,
		amount,
	}: { json: string; recipient: string; amount: bigint },
) {
	await alice.page.goto('/tools/sign');
	await alice.connectWallet({ signIn: false });
	await alice.page
		.getByTestId('transaction-data-input')
		.fill(json);
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
	expect(await chain.balance(recipient)).toBe(amount);
}

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

		await signPreviewedJson(alice, chain, {
			json: await tx.toJSON(),
			recipient,
			amount: MIST_PER_SUI,
		});
	});

	// An address-balance gas payment gets its expiration from the resolver,
	// so JSON without one must not build offline: the bytes signed are the
	// dry run's, expiration included, or the chain refuses them.
	test('signs an address-balance JSON transaction with the expiration the dry run resolved', async ({
		createActor,
		chain,
	}) => {
		const alice = await createActor('alice');
		await chain.fundAddressBalance(
			alice.address,
			10n * MIST_PER_SUI,
		);
		expect(await chain.coins(alice.address)).toEqual([]);
		const recipient = randomAddress();
		const { systemState } =
			await chain.client.getCurrentSystemState();
		const tx = new Transaction();
		tx.setSender(alice.address);
		tx.setGasPrice(BigInt(systemState.referenceGasPrice));
		tx.setGasBudget(MIST_PER_SUI / 10n);
		tx.setGasPayment([]);
		const [coin] = tx.splitCoins(tx.gas, [MIST_PER_SUI]);
		tx.transferObjects([coin], recipient);

		await signPreviewedJson(alice, chain, {
			json: await tx.toJSON(),
			recipient,
			amount: MIST_PER_SUI,
		});
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
		// picker disables devnet once it is.
		await page.goto('/tools/sign');
		await page.getByTestId('tool-network-button').click();
		await page
			.getByRole('option', { name: 'Devnet' })
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

	test("offers Sign but not Sign and execute for another sender's transaction", async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		await chain.fund(bob.address);
		const bytes = await chain.buildSuiTransfer({
			sender: bob.address,
			recipient: randomAddress(),
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
		// Alice's signature can't execute Bob's transaction on its own.
		await expect(
			alice.page.getByTestId('sign-and-execute-button'),
		).toBeDisabled();
		await expect(
			alice.page.getByTestId('sign-button'),
		).toBeEnabled();
		await expect(
			alice.page.getByTestId('sign-note'),
		).toBeVisible();
	});

	test('shows an error for input that is not a transaction', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');

		await alice.page.goto('/tools/sign');
		await alice.page
			.getByTestId('transaction-data-input')
			.fill('hello');

		await expect(
			alice.page.getByTestId('transaction-data-error'),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('transaction-preview-result'),
		).toHaveCount(0);
	});

	// A dry run of an earlier input can land after the input changed; it
	// must not stand in for the new input's, nor make its bytes signable.
	test('a simulation that lands after the input changed neither enables Sign nor is signed', async ({
		createActor,
		chain,
	}) => {
		const alice = await createActor('alice');
		await chain.fund(alice.address);
		const recipientB = randomAddress();
		const bytesA = await chain.buildSuiTransfer({
			sender: alice.address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
		});
		const bytesB = await chain.buildSuiTransfer({
			sender: alice.address,
			recipient: recipientB,
			amount: MIST_PER_SUI,
		});
		const digestA =
			await Transaction.from(bytesA).getDigest();
		const digestB =
			await Transaction.from(bytesB).getDigest();
		expect(digestB).not.toBe(digestA);
		const { page } = alice;

		// Hold each input's dry run, sorted by the input showing when it
		// was sent.
		const held: Record<'A' | 'B', Route[]> = {
			A: [],
			B: [],
		};
		let phase: 'A' | 'B' = 'A';
		await page.route('**/SimulateTransaction', (route) => {
			if (route.request().method() !== 'POST') {
				return route.continue();
			}
			held[phase].push(route);
		});

		await page.goto('/tools/sign');
		await alice.connectWallet({ signIn: false });
		const input = page.getByTestId(
			'transaction-data-input',
		);
		await input.fill(bytesA);
		await expect.poll(() => held.A.length).toBe(1);
		phase = 'B';
		await input.fill(bytesB);

		// A's dry run lands after the input changed, before B's is sent;
		// record whether a passed result or an enabled Sign ever shows.
		const passed =
			'[data-testid="transaction-preview-result"][data-result="success"]';
		const enabledSign =
			'[data-testid="sign-button"]:enabled, [data-testid="sign-and-execute-button"]:enabled';
		await page.evaluate((selector) => {
			const seen = window as { sawStale?: boolean };
			seen.sawStale = false;
			new MutationObserver(() => {
				if (document.querySelector(selector))
					seen.sawStale = true;
			}).observe(document.body, {
				subtree: true,
				childList: true,
				attributes: true,
			});
		}, `${passed}, ${enabledSign}`);
		await Promise.all(
			held.A.map(async (route) => {
				await route.continue();
				await route.request().response();
			}),
		);
		await expect.poll(() => held.B.length).toBe(1);
		expect(
			await page.evaluate(
				() => (window as { sawStale?: boolean }).sawStale,
			),
		).toBe(false);
		await expect(
			page.getByTestId('transaction-preview-digest'),
		).toHaveAttribute('data-digest', digestB);
		await expect(page.locator(enabledSign)).toHaveCount(0);

		await Promise.all(
			held.B.map((route) => route.continue()),
		);
		await expect(page.locator(passed)).toHaveCount(1);
		await expect(
			page.getByTestId('transaction-preview-digest'),
		).toHaveAttribute('data-digest', digestB);
		await page
			.getByTestId('transaction-preview-raw-toggle')
			.click();
		await expect(
			page.getByTestId('transaction-preview-raw'),
		).toHaveValue(bytesB);

		await page.getByTestId('sign-button').click();
		const signature = await page
			.getByTestId('signed-result')
			.getAttribute('data-signature');
		expect(signature).toBeTruthy();
		await chain.execute(bytesB, signature!);
		expect(await chain.balance(recipientB)).toBe(
			MIST_PER_SUI,
		);
	});

	test('shows input that is neither bytes nor JSON as failed, with no preview and no signing', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');
		const { page } = alice;

		await page.goto('/tools/sign');
		await alice.connectWallet({ signIn: false });
		await page
			.getByTestId('transaction-data-input')
			.fill('not a transaction');
		// Input the SDK can't read never reaches the dry run: the input says
		// so, and no preview block or sign buttons show.
		await expect(
			page.getByTestId('transaction-data-error'),
		).toBeVisible();
		await expect(
			page.getByTestId('transaction-preview-result'),
		).toHaveCount(0);
		await expect(
			page.getByTestId('transaction-preview-status'),
		).toHaveCount(0);
		await expect(
			page.getByTestId('sign-button'),
		).toHaveCount(0);
		await expect(
			page.getByTestId('sign-and-execute-button'),
		).toHaveCount(0);
	});
});
