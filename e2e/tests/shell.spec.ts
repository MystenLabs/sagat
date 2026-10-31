// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import type { Page } from '@playwright/test';

import { E2E } from '../support/env';
import { expect, test } from '../support/fixtures';
import {
	acceptInvitation,
	rejectInvitation,
	setupMultisig,
} from '../support/scenarios';

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
		// The designs' width; anything from 1280 keeps the sidebar expanded
		// and saves the user's choice.
		await page.setViewportSize({
			width: 1440,
			height: 900,
		});

		// The alpha pill explains itself on hover.
		await page.goto('/');
		await page.getByTestId('alpha-badge').hover();
		await expect(
			page.getByTestId('alpha-popover'),
		).toBeVisible();
		await page.mouse.move(720, 450);
		await expect(
			page.getByTestId('alpha-popover'),
		).toBeHidden();

		// The network menu works before signing in, marks the current network
		// and picking it keeps the app alive.
		await page.getByTestId('network-menu-button').click();
		const localnet = page.locator(
			'[data-testid="network-option"][data-network="localnet"]',
		);
		await expect(localnet).toHaveAttribute(
			'data-current',
			'true',
		);
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
		// The footer avatar shows the account label's initial
		// (the e2e wallet labels the account with its actor's name).
		await expect(
			page
				.getByTestId('app-header')
				.getByTestId('wallet-avatar'),
		).toHaveText('A');

		// The multisig switcher shows the account over its short address (never
		// the threshold), lists the multisig and offers to create one.
		const subtitle = page.getByTestId(
			'multisig-switcher-subtitle',
		);
		await expect(subtitle).toHaveAttribute(
			'data-tone',
			'ok',
		);
		await expect(subtitle).toHaveText(
			formatAddress(multisig.address),
		);
		await page.getByTestId('multisig-switcher').click();
		await expect(
			page
				.getByTestId('multisig-switcher-option')
				.filter({ hasText: 'Shell test' }),
		).toBeVisible();
		await page
			.getByRole('menuitem', { name: 'Create a pod' })
			.click();
		await expect(
			page.getByTestId('create-page'),
		).toBeVisible();

		// The wallet menu opens from the footer and copies the address.
		await alice.context.grantPermissions([
			'clipboard-read',
			'clipboard-write',
		]);
		await alice.openWalletMenu();
		await expect(
			page.getByTestId('disconnect-button'),
		).toBeVisible();
		await page.getByTestId('copy-address').click();
		await expect(
			alice.toast('Address copied'),
		).toBeVisible();
		expect(
			await page.evaluate(() =>
				navigator.clipboard.readText(),
			),
		).toBe(alice.address);
		// Copying keeps the menu open for a second action.
		await expect(alice.walletMenuButton()).toHaveAttribute(
			'aria-expanded',
			'true',
		);
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
		const toggle = page.getByTestId('sidebar-toggle');
		await toggle.hover();
		await expect(
			page.getByRole('tooltip', {
				name: 'Collapse sidebar',
			}),
		).toBeVisible();
		await expect(toggle).toHaveAccessibleName(
			'Collapse sidebar',
		);
		await toggle.click();
		await expect(sidebar).toHaveAttribute(
			'data-state',
			'collapsed',
		);
		await expect(toggle).toHaveAccessibleName(
			'Expand sidebar',
		);
		await expect(inviteCount).toBeVisible();
		await expect(inviteCount).toHaveText('1');

		// The choice survives a reload on a wide screen.
		await page.reload();
		await expect(sidebar).toHaveAttribute(
			'data-state',
			'collapsed',
		);
		await expect(inviteCount).toHaveText('1');

		// Expanding the rail on a narrower window isn't saved: back on the
		// wide screen the sidebar stays collapsed.
		await page.setViewportSize({
			width: 1024,
			height: 900,
		});
		await toggle.click();
		await expect(sidebar).toHaveAttribute(
			'data-state',
			'expanded',
		);
		await page.setViewportSize({
			width: 1440,
			height: 900,
		});
		await expect(sidebar).toHaveAttribute(
			'data-state',
			'collapsed',
		);

		await toggle.click();
		await expect(sidebar).toHaveAttribute(
			'data-state',
			'expanded',
		);
	});

	test('the switcher flags rejected invitations and an unreachable threshold', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const carol = createIdentity('carol');
		// Grants: Carol rejects, but Alice and Bob still reach the threshold.
		const grants = await setupMultisig({
			creator: alice,
			members: [bob, carol],
			threshold: 2,
			name: 'Grants',
			labels: ['Alice', 'Bob', 'Carol'],
			accept: false,
		});
		await acceptInvitation(bob, grants.address);
		await rejectInvitation(carol, grants.address);
		// Treasury: both reject, so Alice alone can never reach 3.
		const treasury = await setupMultisig({
			creator: alice,
			members: [bob, carol],
			threshold: 3,
			name: 'Treasury',
			accept: false,
		});
		await rejectInvitation(bob, treasury.address);
		await rejectInvitation(carol, treasury.address);

		const { page } = alice;
		await page.setViewportSize({
			width: 1440,
			height: 900,
		});
		await alice.signIn();
		await page.goto(
			`/multisig/${grants.address}/proposals`,
		);
		await expect(
			page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			grants.address,
		);

		const trigger = page.getByTestId('multisig-switcher');
		const subtitle = page.getByTestId(
			'multisig-switcher-subtitle',
		);
		const option = (address: string) =>
			page.locator(
				`[data-testid="multisig-switcher-option"][data-address="${address}"]`,
			);

		await test.step('a rejection the others can absorb is a warning', async () => {
			await expect(trigger).toHaveAttribute(
				'data-tone',
				'warning',
			);
			await expect(subtitle).toHaveText(
				'Carol rejected the invitation.',
			);

			await trigger.click();
			await expect(option(grants.address)).toHaveAttribute(
				'data-tone',
				'warning',
			);
			await expect(option(grants.address)).toContainText(
				'Carol rejected the invitation.',
			);
			await expect(
				option(treasury.address),
			).toHaveAttribute('data-tone', 'error');
			await expect(option(treasury.address)).toContainText(
				'2 signers rejected, and the threshold needs them.',
			);
		});

		await test.step('an unreachable threshold is an error', async () => {
			await option(treasury.address).click();
			await expect(
				page.getByTestId('multisig-detail'),
			).toHaveAttribute(
				'data-multisig-address',
				treasury.address,
			);
			await expect(trigger).toHaveAttribute(
				'data-tone',
				'error',
			);
			await expect(subtitle).toHaveText(
				'2 signers rejected, and the threshold needs them.',
			);
		});

		await test.step('the icon rail keeps the status in the tooltip', async () => {
			await page.getByTestId('sidebar-toggle').click();
			await expect(
				page.locator('[data-slot="sidebar"]'),
			).toHaveAttribute('data-state', 'collapsed');
			await trigger.hover();
			await expect(
				page.getByRole('tooltip', {
					name: 'Treasury · 2 signers rejected, and the threshold needs them.',
				}),
			).toBeVisible();
		});
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
		// can't leave it from the network menu or the banner.
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

		const banner = page.getByRole('region', {
			name: 'Test mode',
		});
		await expect(banner).toContainText(hint);
		await expect(
			banner.getByRole('button', {
				name: 'Switch to Mainnet',
			}),
		).toBeDisabled();

		await test.step('the banner sits above the page and dismisses', async () => {
			const heading = page
				.getByRole('main')
				.getByRole('heading', { level: 1 })
				.first();
			await expect(heading).toBeVisible();
			const bannerBox = await banner.boundingBox();
			const headingBox = await heading.boundingBox();
			expect(
				bannerBox!.y + bannerBox!.height,
			).toBeLessThanOrEqual(headingBox!.y);

			await banner
				.getByRole('button', { name: 'Dismiss' })
				.click();
			await expect(banner).toBeHidden();
		});
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
			alice.toast('Address copied'),
		).toBeVisible();
		expect(
			await page.evaluate(() =>
				navigator.clipboard.readText(),
			),
		).toBe(multisig.address);
	});

	test('opens the tools from the sidebar', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');
		const { page } = alice;

		await page.goto('/tools');
		await expect(
			page.getByTestId('tools-page'),
		).toBeVisible();
		await expect(page).toHaveURL(
			/\/tools\/signature-analyzer$/,
		);
		await expect(
			page.getByRole('heading', { level: 1 }),
		).toHaveText('Signature Analyzer');

		await page
			.locator('[data-slot="sidebar"]')
			.getByRole('link', { name: 'Broadcasts' })
			.click();
		await expect(page).toHaveURL(/\/tools\/broadcast$/);
		await expect(
			page.getByRole('heading', { level: 1 }),
		).toHaveText('Broadcasts');
	});
});
