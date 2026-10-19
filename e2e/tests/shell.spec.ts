// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Page } from '@playwright/test';

import { E2E } from '../support/env';
import { expect, test } from '../support/fixtures';
import { setupMultisig } from '../support/scenarios';

// The e2e API only serves localnet, so the app would never offer mainnet or
// testnet. Report them as served too, so the only thing that can disable
// them is the wallet.
async function serveAllNetworks(page: Page) {
	await page.route(
		`${E2E.apiUrl}/health`,
		async (route) => {
			const response = await route.fetch();
			await route.fulfill({
				response,
				json: {
					...(await response.json()),
					networks: ['mainnet', 'testnet', 'localnet'],
				},
			});
		},
	);
}

test.describe('app shell', () => {
	test('the sidebar menus open and the sidebar collapses', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 1,
			name: 'Shell test',
		});
		// A pending invitation for alice, so the sidebar shows a count.
		await setupMultisig({
			creator: bob,
			members: [alice],
			threshold: 2,
			accept: false,
		});
		const { page } = alice;

		// The network menu works before signing in and picking the current
		// network keeps the app alive.
		await page.goto('/');
		await page.getByTestId('network-menu-button').click();
		const localnet = page.getByRole('menuitem', {
			name: 'localnet',
		});
		await expect(localnet).toBeVisible();
		await localnet.click();
		await expect(
			page.getByTestId('connect-wallet-prompt'),
		).toBeVisible();

		await alice.signIn();
		await expect(
			page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			multisig.address,
		);

		// The multisig switcher lists the multisig and offers to create one.
		await page.getByTestId('multisig-switcher').click();
		await expect(
			page
				.getByTestId('multisig-switcher-option')
				.filter({ hasText: 'Shell test' }),
		).toBeVisible();
		await page
			.getByRole('menuitem', { name: 'New multisig' })
			.click();
		await expect(
			page.getByTestId('create-multisig-submit'),
		).toBeVisible();

		// The wallet menu opens from the footer.
		await alice.walletMenuButton().click();
		await expect(
			page
				.getByTestId('app-header')
				.getByTestId('disconnect-button'),
		).toBeVisible();
		await page.keyboard.press('Escape');

		// Collapsing hides the labels but keeps the invitations count on the
		// rail; the toggle brings the labels back.
		const sidebar = page.locator('[data-slot="sidebar"]');
		const inviteCount = page.getByTestId(
			'nav-invitations-count',
		);
		await expect(sidebar).toHaveAttribute(
			'data-state',
			'expanded',
		);
		await expect(inviteCount).toHaveText('1');
		await page.getByTestId('sidebar-toggle').click();
		await expect(sidebar).toHaveAttribute(
			'data-state',
			'collapsed',
		);
		await expect(inviteCount).toBeVisible();
		await expect(inviteCount).toHaveText('1');
		await page.getByTestId('sidebar-toggle').click();
		await expect(sidebar).toHaveAttribute(
			'data-state',
			'expanded',
		);
	});

	test('networks the wallet does not advertise are disabled', async ({
		createActor,
	}) => {
		const hint = `Not in ${E2E.walletName}`;

		// A wallet with every chain can pick mainnet.
		const bob = await createActor('bob');
		await serveAllNetworks(bob.page);
		await bob.page.goto('/');
		await bob.connectWallet();
		await bob.page
			.getByTestId('network-menu-button')
			.click();
		await expect(
			bob.page.getByRole('menuitem', { name: 'mainnet' }),
		).toBeEnabled();

		// A wallet that only advertises localnet stays connected there, but
		// can't leave it from the network menu, the Test Mode switch or the
		// banner.
		const alice = await createActor('alice', {
			walletChains: ['sui:localnet'],
		});
		const { page } = alice;
		await serveAllNetworks(page);
		await page.goto('/');
		await alice.connectWallet();

		await page.getByTestId('network-menu-button').click();
		for (const network of ['mainnet', 'testnet']) {
			const item = page.getByRole('menuitem', {
				name: new RegExp(`^${network}`),
			});
			await expect(item).toBeDisabled();
			await expect(item).toContainText(hint);
		}
		await expect(
			page.getByRole('menuitem', { name: 'localnet' }),
		).toBeEnabled();
		await page.keyboard.press('Escape');

		await alice.walletMenuButton().click();
		const header = page.getByTestId('app-header');
		await expect(
			header.getByRole('switch').filter({ visible: true }),
		).toBeDisabled();
		await expect(
			header.getByText(hint).filter({ visible: true }),
		).toBeVisible();
		await page.keyboard.press('Escape');

		const banner = page.getByTestId('test-mode-banner');
		await expect(banner).toContainText(hint);
		await expect(
			banner.getByRole('button', {
				name: 'Switch to Mainnet',
			}),
		).toBeDisabled();
	});

	test('receive shows the full multisig address', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 1,
			name: 'Receive test',
		});
		const { page } = alice;

		await page.goto('/');
		await alice.signIn();
		await expect(
			page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			multisig.address,
		);

		await page.getByTestId('receive-button').click();
		const dialog = page.getByTestId('receive-dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('Receive test');
		await expect(
			page.getByTestId('receive-address'),
		).toHaveText(multisig.address);

		// Clicking the QR code copies the address, like the button.
		await alice.context.grantPermissions([
			'clipboard-read',
			'clipboard-write',
		]);
		await page.getByTestId('receive-qr').click();
		await expect(
			page.getByTestId('receive-copy'),
		).toHaveText('Address copied');
		expect(
			await page.evaluate(() =>
				navigator.clipboard.readText(),
			),
		).toBe(multisig.address);
	});
});
