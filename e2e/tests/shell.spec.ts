// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '../support/fixtures';
import { setupMultisig } from '../support/scenarios';

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

		// Collapsing hides the labels; the toggle brings them back.
		const sidebar = page.locator('[data-slot="sidebar"]');
		await expect(sidebar).toHaveAttribute(
			'data-state',
			'expanded',
		);
		await page.getByTestId('sidebar-toggle').click();
		await expect(sidebar).toHaveAttribute(
			'data-state',
			'collapsed',
		);
		await page.getByTestId('sidebar-toggle').click();
		await expect(sidebar).toHaveAttribute(
			'data-state',
			'expanded',
		);
	});
});
