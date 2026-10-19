// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

import { E2E } from '../support/env';
import { expect, test } from '../support/fixtures';

// Where the wallet kit keeps the session it restores on load.
const SAVED_SESSION_KEY =
	'mysten-dapp-kit:selected-wallet-and-address';

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

	test("a saved session that can't be restored falls back to the connect prompt", async ({
		createActor,
	}) => {
		const alice = await createActor('alice');
		const { page } = alice;
		const prompt = page.getByTestId(
			'connect-wallet-prompt',
		);
		const reconnecting = page
			.getByRole('status')
			.filter({ hasText: 'Reconnecting wallet' });

		// Reloads with `session` saved and expects the connect prompt within
		// the restore budget (kit timeout 2s, layout hold capped at 3s).
		const reloadWithSession = async (session: string) => {
			await page.evaluate(
				([key, value]) => localStorage.setItem(key, value),
				[SAVED_SESSION_KEY, session],
			);
			await page.reload();
			await expect(reconnecting).toBeAttached();
			await expect(prompt).toBeVisible({ timeout: 4000 });
			await expect(reconnecting).toHaveCount(0);
		};

		await page.goto('/');
		await expect(prompt).toBeVisible();

		// A wallet that isn't installed: the kit gives up after its timeout.
		await reloadWithSession('nope:0x1');

		// The installed wallet, for an address it doesn't hold, and its silent
		// reconnect throws: the kit stays in `reconnecting` for good, so only
		// the 3s cap lets the prompt show.
		await page.addInitScript(() => {
			const timer = setInterval(() => {
				const wallet = window.__e2eWallet;
				if (!wallet) return;
				clearInterval(timer);
				const features = Object.getOwnPropertyDescriptor(
					Object.getPrototypeOf(wallet),
					'features',
				)!.get!;
				Object.defineProperty(wallet, 'features', {
					get: () => ({
						...features.call(wallet),
						'standard:connect': {
							version: '1.0.0',
							connect: () =>
								Promise.reject(new Error('restore failed')),
						},
					}),
				});
			}, 10);
		});
		const stranger = new Ed25519Keypair().toSuiAddress();
		await reloadWithSession(
			`${E2E.walletName}:${stranger}:`,
		);
	});
});
