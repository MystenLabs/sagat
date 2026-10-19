// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

import { LocalStorageKeys } from '../../app/src/lib/localStorageKeys';
import { E2E } from '../support/env';
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

	test("a saved session that can't be restored falls back to the connect prompt", async ({
		createActor,
	}) => {
		const alice = await createActor('alice', {
			failRestore: true,
		});
		const { page } = alice;
		const prompt = page.getByTestId(
			'connect-wallet-prompt',
		);
		const reconnecting = page.getByTestId(
			'wallet-reconnecting',
		);

		// Reloads with `session` saved and expects the connect prompt within
		// the restore budget (kit timeout 2s, layout hold capped at 3s).
		const reloadWithSession = async (session: string) => {
			await page.evaluate(
				([key, value]) => localStorage.setItem(key, value),
				[LocalStorageKeys.WalletSession, session],
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
		const stranger = new Ed25519Keypair().toSuiAddress();
		await reloadWithSession(
			`${E2E.walletName}:${stranger}:`,
		);
	});

	test('an unreachable API shows a retry state instead of asking for a signature', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');
		await alice.signIn();

		const apiRoutes = `${E2E.apiUrl}/**`;
		await alice.page.route(apiRoutes, (route) =>
			route.abort('connectionrefused'),
		);
		await alice.page.reload();

		await expect(
			alice.page.getByTestId('api-unreachable'),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('auth-prompt'),
		).toHaveCount(0);

		// The wallet menu doesn't offer a signature that would only fail.
		await alice.walletMenuButton().click();
		await expect(
			alice.page.getByTestId('disconnect-button'),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('wallet-menu-sign'),
		).toHaveCount(0);
		await expect(
			alice.page.getByTestId('wallet-account-sign'),
		).toHaveCount(0);
		await expect(
			alice.page.getByText('Authentication Required'),
		).toHaveCount(0);
		await alice.walletMenuButton().click();

		await alice.page.unroute(apiRoutes);
		await alice.page
			.getByTestId('api-retry-button')
			.click();

		await expect(alice.walletMenuButton()).toHaveAttribute(
			'data-auth-state',
			'authenticated',
		);
		await expect(
			alice.page.getByTestId('dashboard-empty'),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('api-unreachable'),
		).toHaveCount(0);
	});

	test('a failed refetch keeps a signed-in user on the dashboard', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');
		await alice.signIn();
		await expect(
			alice.page.getByTestId('dashboard-empty'),
		).toBeVisible();

		let failedChecks = 0;
		await alice.page.route(
			`${E2E.apiUrl}/auth/check`,
			(route) => {
				failedChecks++;
				return route.abort('connectionrefused');
			},
		);

		// React Query refetches on visibilitychange (its focus signal).
		await alice.page.evaluate(() =>
			window.dispatchEvent(new Event('visibilitychange')),
		);
		// The first attempt and its one retry.
		await expect.poll(() => failedChecks).toBe(2);

		// Opening the menu waits for a render after the failure settled.
		await alice.walletMenuButton().click();
		await expect(alice.walletMenuButton()).toHaveAttribute(
			'data-auth-state',
			'authenticated',
		);
		await expect(
			alice.page.getByTestId('dashboard-empty'),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('api-unreachable'),
		).toHaveCount(0);
	});
});
