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
		await card
			.getByTestId('invitation-toggle-details')
			.click();
		await expect(
			bob.memberItem(alice.address),
		).toHaveAttribute('data-status', 'accepted');
		await expect(
			bob.memberItem(bob.address),
		).toHaveAttribute('data-status', 'pending');
		await card
			.getByTestId('accept-invitation-button')
			.click();

		await expect(card).toBeHidden();
		await expect(
			bob.page.getByTestId('invitations-empty'),
		).toBeVisible();

		// With every member on board, the multisig is verified and opens.
		await bob.page.goto('/');
		await expect(
			bob.page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			multisig.address,
		);
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
		await card
			.getByTestId('invitation-toggle-details')
			.click();
		await card
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
