// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { Route } from '@playwright/test';

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
		await expect(
			alice.toast('Wallet disconnected'),
		).toBeVisible();

		// Reconnecting signs in again: the session cookie is gone.
		const connectRequest = alice.page.waitForRequest(
			(request) =>
				request.url() === `${E2E.apiUrl}/auth/connect` &&
				request.method() === 'POST',
		);
		await alice.connectWallet();
		await connectRequest;
		await expect(alice.walletMenuButton()).toHaveAttribute(
			'data-auth-state',
			'authenticated',
		);
	});

	test('a declined signature or connection leaves the app signed out', async ({
		createActor,
	}) => {
		const alice = await createActor('alice', {
			declineSign: true,
		});
		const { page } = alice;
		const prompt = page.getByTestId(
			'connect-wallet-prompt',
		);
		const declined = alice.declinedLine();

		await test.step('a declined signature disconnects the wallet', async () => {
			await page.goto('/');
			await prompt
				.getByTestId('connect-wallet-button')
				.click();
			await alice.walletOption().click();

			await expect(declined).toBeVisible();
			await expect(declined).toHaveAttribute(
				'data-wallet',
				E2E.walletName,
			);
			await expect(
				page.getByTestId('wallet-menu-button'),
			).toHaveCount(0);
			expect(
				await page.evaluate(
					(key) => localStorage.getItem(key),
					LocalStorageKeys.WalletSession,
				),
			).toBeNull();

			// Nothing is left to restore.
			await page.reload();
			await expect(prompt).toBeVisible();
			await expect(
				page.getByTestId('wallet-reconnecting'),
			).toHaveCount(0);
		});

		await test.step('trying again reconnects and signs in', async () => {
			// The reload took the error line away, so decline once more.
			await prompt
				.getByTestId('connect-wallet-button')
				.click();
			await alice.walletOption().click();
			await expect(declined).toBeVisible();

			await page.evaluate(() => {
				window.__e2eWallet!.declineSign = false;
			});
			await page.getByTestId('connect-retry').click();
			await expect(
				alice.walletMenuButton(),
			).toHaveAttribute('data-auth-state', 'authenticated');
		});

		await test.step('a declined connection is reported the same way', async () => {
			await alice.walletMenuButton().click();
			await page.getByTestId('disconnect-button').click();
			await expect(prompt).toBeVisible();
			await page.evaluate(() => {
				window.__e2eWallet!.declineConnect = true;
			});

			await page
				.getByTestId('app-header')
				.getByTestId('connect-wallet-button')
				.filter({ visible: true })
				.click();
			await alice.walletOption().click();
			await expect(declined).toHaveAttribute(
				'data-wallet',
				E2E.walletName,
			);
			await expect(
				page.getByTestId('wallet-menu-button'),
			).toHaveCount(0);
		});
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
			alice.page.getByTestId('wallet-account-sign'),
		).toHaveCount(0);
		await alice.closeWalletMenu();

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

	test('a check made offline shows the retry state, and reconnecting re-checks', async ({
		createActor,
	}) => {
		const alice = await createActor('alice', {
			otherAccounts: ['alice-savings'],
		});
		const [savings] = alice.otherAccounts;
		await alice.signIn();

		// A new account starts a fresh check while the browser is offline.
		await alice.context.setOffline(true);
		await alice.switchAccount(savings);
		await expect(
			alice.page.getByTestId('api-unreachable'),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('auth-prompt'),
		).toHaveCount(0);

		// Coming back online re-checks on its own.
		await alice.context.setOffline(false);
		await expect(
			alice.page.getByTestId('auth-prompt'),
		).toBeVisible();
	});

	test('a failed refetch keeps a signed-in user on the dashboard, and withholds signing until a check succeeds', async ({
		createActor,
	}) => {
		const alice = await createActor('alice', {
			otherAccounts: ['alice-savings'],
		});
		const [savings] = alice.otherAccounts;
		// A fake clock lets the test run past the 5 minutes after which
		// React Query evicts unused cache entries. Request timeouts keep
		// real time, so a held check stays held.
		await alice.page.addInitScript(() => {
			(
				window as { nativeTimeout?: unknown }
			).nativeTimeout = AbortSignal.timeout;
		});
		await alice.page.clock.install();
		await alice.page.addInitScript(() => {
			AbortSignal.timeout = (
				window as {
					nativeTimeout?: typeof AbortSignal.timeout;
				}
			).nativeTimeout!;
		});
		await alice.signIn();

		let failedChecks = 0;
		let holdChecks = false;
		const heldChecks: Route[] = [];
		await alice.page.route(
			`${E2E.apiUrl}/auth/check`,
			(route) => {
				if (holdChecks) {
					heldChecks.push(route);
					return;
				}
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

		// Other accounts stay listed, but signing one in would only fail.
		await expect(
			alice.walletAccount(savings.address),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('wallet-account-sign'),
		).toHaveCount(0);
		await alice.closeWalletMenu();

		// The outage holds for another account too, while its re-check
		// hangs.
		holdChecks = true;
		await alice.switchAccount(savings);
		await expect
			.poll(() => heldChecks.length)
			.toBeGreaterThan(0);
		await expect(
			alice.page.getByTestId('api-unreachable'),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('auth-prompt'),
		).toHaveCount(0);
		await alice.walletMenuButton().click();
		await expect(
			alice.page.getByTestId('wallet-account-sign'),
		).toHaveCount(0);
		await alice.closeWalletMenu();

		// Once a check gets through, signing is back.
		await Promise.all(
			heldChecks.map((route) => route.continue()),
		);
		await expect(
			alice.page.getByTestId('auth-prompt'),
		).toBeVisible();
		await expect(
			alice.page.getByTestId('api-unreachable'),
		).toHaveCount(0);

		// Evicting unused cache entries doesn't bring the outage back, even
		// while the next check hangs.
		const held = heldChecks.length;
		await alice.switchAccount(alice);
		await expect
			.poll(() => heldChecks.length)
			.toBeGreaterThan(held);
		await alice.page.clock.fastForward('06:00');
		await alice.walletMenuButton().click();
		await expect(
			alice
				.walletAccount(savings.address)
				.getByTestId('wallet-account-sign'),
		).toBeVisible();
	});
});
