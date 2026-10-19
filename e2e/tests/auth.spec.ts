// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '../support/fixtures';

test.describe('wallet sign-in', () => {
	test('signs in with a wallet signature and keeps the session across reloads', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');

		await alice.signIn();
		await expect(
			alice.page.getByTestId('dashboard-empty'),
		).toBeVisible();

		// The restore holds the layout: the connect prompt never shows.
		await alice.page.addInitScript(() => {
			new MutationObserver(() => {
				if (
					document.querySelector(
						'[data-testid="connect-wallet-prompt"]',
					)
				) {
					(window as { sawPrompt?: boolean }).sawPrompt =
						true;
				}
			}).observe(document, {
				childList: true,
				subtree: true,
			});
		});
		await alice.page.reload();
		await expect(alice.walletMenuButton()).toHaveAttribute(
			'data-auth-state',
			'authenticated',
		);
		await expect(
			alice.page.getByTestId('dashboard-empty'),
		).toBeVisible();
		expect(
			await alice.page.evaluate(
				() => (window as { sawPrompt?: boolean }).sawPrompt,
			),
		).toBeUndefined();
	});

	test('disconnecting ends the API session', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');
		await alice.signIn();

		await alice.walletMenuButton().click();
		await alice.page
			.getByTestId('disconnect-button')
			.click();
		await expect(
			alice.page.getByTestId('connect-wallet-prompt'),
		).toBeVisible();

		// Reconnecting asks for a new signature: the session cookie is gone.
		await alice.connectWallet();
		await expect(
			alice.page.getByTestId('auth-prompt'),
		).toBeVisible();
	});
});
