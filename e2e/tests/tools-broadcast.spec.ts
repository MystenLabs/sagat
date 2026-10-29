// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MIST_PER_SUI } from '@mysten/sui/utils';

import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';

// The Broadcasts tool at /tools/broadcast: paste transaction bytes
// and a signature, and execute them. No wallet is involved.
test.describe('broadcasts tool', () => {
	test('executes signed transaction bytes', async ({
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

		await alice.page.goto('/tools/broadcast');
		const button = alice.page.getByTestId(
			'broadcast-button',
		);
		await alice.page
			.getByTestId('broadcast-bytes-input')
			.fill(bytes);
		await expect(button).toBeDisabled();
		await alice.page
			.getByTestId('broadcast-signature-input')
			.fill(await alice.signTransaction(bytes));
		await button.click();

		const result = alice.page.getByTestId(
			'broadcast-result',
		);
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

		await alice.page
			.getByTestId('broadcast-reset-button')
			.click();
		await expect(result).toHaveCount(0);
		await expect(
			alice.page.getByTestId('broadcast-bytes-input'),
		).toHaveValue('');
	});

	test('reports a signature by someone other than the sender', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		await chain.fund(alice.address);
		const recipient = randomAddress();
		const bytes = await chain.buildSuiTransfer({
			sender: alice.address,
			recipient,
			amount: MIST_PER_SUI,
		});

		await alice.page.goto('/tools/broadcast');
		await alice.page
			.getByTestId('broadcast-bytes-input')
			.fill(bytes);
		await alice.page
			.getByTestId('broadcast-signature-input')
			.fill(await bob.signTransaction(bytes));
		await alice.page
			.getByTestId('broadcast-button')
			.click();

		const error = alice.page.getByTestId('broadcast-error');
		await expect(error).toBeVisible();
		await expect(error).toContainText('Broadcast failed:');
		await expect(
			alice.page.getByTestId('broadcast-result'),
		).toHaveCount(0);
		expect(await chain.balance(recipient)).toBe(0n);

		// The form stays filled for another go; editing it clears the error.
		await expect(
			alice.page.getByTestId('broadcast-button'),
		).toBeEnabled();
		await alice.page
			.getByTestId('broadcast-signature-input')
			.fill(await alice.signTransaction(bytes));
		await expect(error).toHaveCount(0);
	});
});
