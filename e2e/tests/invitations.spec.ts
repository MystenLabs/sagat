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
			accept: false,
		});

		await bob.signIn();
		await expect(
			bob.page.getByTestId('nav-invitations-count'),
		).toHaveText('1');
		await bob.page.getByTestId('nav-invitations').click();

		const card = bob.invitationCard(multisig.address);
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
		// Signer rows do the same when tabbed to.
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
		await bob.page
			.getByTestId('reject-invitation-button')
			.click();
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
