// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '../support/fixtures';
import { setupMultisig } from '../support/scenarios';

test.describe('invitations', () => {
	test('an invited member accepts from their own browser', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = createIdentity('alice');
		const bob = await createActor('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
			labels: ['Alice', null],
			accept: false,
		});

		await bob.signIn();
		await expect(
			bob.page.getByTestId('nav-invitations-count'),
		).toHaveText('1');
		await bob.page.getByTestId('nav-invitations').click();

		const card = bob.invitationCard(multisig.address);
		// A labelled creator shows by name, beside their address.
		await expect(
			card.getByTestId('invitation-invited-by'),
		).toHaveText('Invited by Alice');
		// The short creator address shows the full one on hover.
		await card
			.locator(`[data-address="${alice.address}"]`)
			.hover();
		const addressTip = bob.page
			.getByRole('tooltip')
			.filter({ hasText: alice.address });
		await expect(addressTip).toBeVisible();
		// The tooltip stays open while hovered and can copy the address.
		await bob.context.grantPermissions([
			'clipboard-read',
			'clipboard-write',
		]);
		await addressTip.getByTestId('address-copy').click();
		expect(
			await bob.page.evaluate(() =>
				navigator.clipboard.readText(),
			),
		).toBe(alice.address);
		await card
			.getByTestId('invitation-toggle-details')
			.click();
		await expect(
			bob.memberItem(alice.address),
		).toHaveAttribute('data-status', 'accepted');
		await expect(
			bob.page.getByTestId('invitation-review'),
		).toContainText('Alice invited you as a signer.');
		// A labelled signer shows by name over the address; an unlabelled
		// one shows the address alone.
		await expect(
			bob
				.memberItem(alice.address)
				.getByTestId('member-label'),
		).toHaveText('Alice');
		await expect(
			bob
				.memberItem(bob.address)
				.getByTestId('member-label'),
		).toHaveCount(0);
		// Signer addresses show the full one when tabbed to.
		await bob
			.memberItem(alice.address)
			.locator(`button[data-address="${alice.address}"]`)
			.focus();
		await bob.page.keyboard.press('Tab');
		await expect(
			bob
				.memberItem(bob.address)
				.locator(`button[data-address="${bob.address}"]`),
		).toBeFocused();
		await expect(
			bob.page
				.getByRole('tooltip')
				.filter({ hasText: bob.address }),
		).toBeVisible();
		await expect(
			bob.memberItem(bob.address),
		).toHaveAttribute('data-status', 'pending');
		// The review dialog renders in a portal, outside the card.
		await bob.page
			.getByTestId('accept-invitation-button')
			.click();

		// Accepting lands on the account with a greeting.
		await expect(
			bob.page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			multisig.address,
		);
		await expect(
			bob.page.getByTestId('joined-banner'),
		).toContainText('You joined');
		// The greeting shows once, not again on reload.
		await bob.page.reload();
		await expect(
			bob.page.getByTestId('multisig-detail'),
		).toBeVisible();
		await expect(
			bob.page.getByTestId('joined-banner'),
		).toBeHidden();
		await bob.page.getByTestId('nav-invitations').click();
		await expect(
			bob.page.getByTestId('invitations-empty'),
		).toBeVisible();

		// With every member on board, the multisig is verified.
		const saved = await alice.api.getMultisig(
			multisig.address,
		);
		expect(saved.isVerified).toBe(true);
	});

	test('accepting lands on the account even while the account list fails to refresh', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = createIdentity('alice');
		const bob = await createActor('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
			accept: false,
		});

		await bob.signIn();
		await bob.page.getByTestId('nav-invitations').click();
		await bob
			.invitationCard(multisig.address)
			.getByTestId('invitation-toggle-details')
			.click();

		const paths: string[] = [];
		bob.page.on('framenavigated', (frame) => {
			if (frame === bob.page.mainFrame())
				paths.push(new URL(frame.url()).pathname);
		});
		// The account list refresh fails; the accept call still goes through.
		const accountList = '**/addresses/connections**';
		await bob.page.route(accountList, (route) =>
			route.abort(),
		);
		await bob.page
			.getByTestId('accept-invitation-button')
			.click();

		// It goes to the account at once (before the refresh gives up after
		// its retries) and waits there rather than bouncing to the dashboard.
		const accountPath = `/multisig/${multisig.address}/overview`;
		await expect(bob.page).toHaveURL(
			new RegExp(`${accountPath}$`),
			{ timeout: 3_000 },
		);
		await expect(
			bob.page.getByTestId('skeleton-page'),
		).toBeVisible();

		await bob.page.unroute(accountList);
		await expect(
			bob.page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			multisig.address,
		);
		await expect(
			bob.page.getByTestId('joined-banner'),
		).toContainText('You joined');
		expect(paths).not.toContain('/');
		await bob.page.getByTestId('multisig-switcher').click();
		await expect(
			bob.page.locator(
				`[data-testid="multisig-switcher-option"][data-address="${multisig.address}"]`,
			),
		).toBeVisible();
	});

	test('an invited member rejects and the creator sees it', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');
		const bob = await createActor('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
			accept: false,
		});

		await bob.signIn();
		await bob.page.getByTestId('nav-invitations').click();
		const card = bob.invitationCard(multisig.address);
		// Rejecting asks for confirmation first.
		await card
			.getByTestId('reject-invitation-open')
			.click();
		// Hold the request: Escape mid-request leaves the dialog open, so a
		// second reject can't start.
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await bob.page.route(
			'**/multisig/*/reject',
			async (route) => {
				await held;
				await route.continue();
			},
		);
		const rejectButton = bob.page.getByTestId(
			'reject-invitation-button',
		);
		await rejectButton.click();
		await expect(rejectButton).toHaveText(
			'Confirm in your wallet…',
		);
		await bob.page.keyboard.press('Escape');
		await expect(
			bob.page.getByTestId('invitation-reject-confirm'),
		).toHaveAttribute('data-open', '');
		release();
		await expect(card).toBeHidden();

		await bob.page
			.getByTestId('invitations-tab-rejected')
			.click();
		await expect(
			bob.invitationCard(multisig.address),
		).toBeVisible();

		await alice.signIn();
		await alice.page
			.getByTestId('multisig-tab-overview')
			.click();
		await expect(
			alice.memberItem(bob.address),
		).toHaveAttribute('data-status', 'rejected');
	});
});
