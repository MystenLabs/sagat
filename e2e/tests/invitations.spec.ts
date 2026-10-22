// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '../support/fixtures';
import {
	acceptInvitation,
	setupMultisig,
	signInViaApi,
} from '../support/scenarios';

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
		// The weight bar: Alice's accepted weight, yours, the threshold,
		// and one segment per unit of weight, accepted first.
		const weightBar = bob.page.getByTestId(
			'invitation-weight-bar',
		);
		await expect(
			weightBar.getByTestId('weight-legend-you'),
		).toHaveText('Your weight 1');
		await expect(
			weightBar.getByTestId('weight-legend-accepted'),
		).toHaveText('Accepted 1');
		await expect(
			weightBar.getByTestId('weight-legend-threshold'),
		).toHaveText('Threshold 2 of 2');
		expect(
			await weightBar
				.locator('[data-tone]')
				.evaluateAll((segments) =>
					segments.map((s) => s.getAttribute('data-tone')),
				),
		).toEqual(['accepted', 'you']);
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

	test('the weight bar sorts by state and collapses to runs past ten units', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = createIdentity('alice');
		const daniel = createIdentity('daniel');
		const bob = await createActor('bob');
		const carol = createIdentity('carol');
		const dave = createIdentity('dave');
		// Signer order puts pending Carol (2) before Bob (2) and accepted
		// Daniel (3) after him; Alice (4) has accepted, Dave (1) has not.
		const multisig = await setupMultisig({
			creator: alice,
			members: [carol, bob, daniel, dave],
			weights: [4, 2, 2, 3, 1],
			threshold: 8,
			labels: ['Alice', 'Carol', 'Bob', 'Daniel', 'Dave'],
			accept: false,
		});
		await acceptInvitation(daniel, multisig.address);

		await bob.signIn();
		await bob.page.getByTestId('nav-invitations').click();
		await bob
			.invitationCard(multisig.address)
			.getByTestId('invitation-toggle-details')
			.click();
		const weightBar = bob.page.getByTestId(
			'invitation-weight-bar',
		);
		await expect(
			weightBar.getByTestId('weight-legend-accepted'),
		).toHaveText('Accepted 7');
		await expect(
			weightBar.getByTestId('weight-legend-threshold'),
		).toHaveText('Threshold 8 of 12');
		// Accepted runs first, then Bob's, then the pending ones: never in
		// signer order, one run per signer sized by their weight.
		const parts = weightBar.locator('[data-tone]');
		expect(
			await parts.evaluateAll((runs) =>
				runs.map(
					(r) =>
						`${r.getAttribute('data-tone')}:${r.getAttribute('data-weight')}`,
				),
			),
		).toEqual([
			'accepted:4',
			'accepted:3',
			'you:2',
			'pending:2',
			'pending:1',
		]);
		const boxes = await parts.evaluateAll((runs) =>
			runs.map((r) => {
				const b = r.getBoundingClientRect();
				return { x: b.x, width: b.width };
			}),
		);
		expect(boxes[0].width / boxes[1].width).toBeCloseTo(
			4 / 3,
			1,
		);
		expect(boxes[3].width / boxes[4].width).toBeCloseTo(
			2,
			1,
		);
		// The threshold of 8 falls one unit into Bob's run of two, so the
		// marker sits halfway along it.
		const marker = await weightBar
			.getByTestId('weight-threshold-marker')
			.evaluate((m) => m.getBoundingClientRect().x);
		expect(marker).toBeCloseTo(
			boxes[2].x + boxes[2].width / 2,
			-1,
		);
	});

	test('an accept that lands after switching accounts stays on the invitations page', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = createIdentity('alice');
		const bob = await createActor('bob', {
			otherAccounts: ['bob-savings'],
		});
		const [savings] = bob.otherAccounts;
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
			accept: false,
		});

		await bob.signIn();
		// Savings signs in too, so its inbox loads once it's selected and the
		// accept's refresh of that inbox shows the hook has settled.
		await bob.signInAccount(savings);
		await bob.switchAccount(bob);
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
		// Hold the accept until bob has moved to his other account.
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await bob.page.route(
			'**/multisig/*/accept',
			async (route) => {
				await held;
				await route.continue();
			},
		);
		await bob.page
			.getByTestId('accept-invitation-button')
			.click();
		await expect(
			bob.page.getByTestId('accept-invitation-button'),
		).toHaveText('Confirm in your wallet…');
		// The review dialog covers the header mid-sign, so switch from the
		// wallet side, the way an extension's account picker would.
		const selectInWallet = (address: string) =>
			bob.page.evaluate(
				(address) =>
					window.__e2eWallet!.setSelectedAccount(address),
				address,
			);
		const savingsInbox = `/addresses/invitations/${encodeURIComponent(savings.publicKey)}`;
		const waitForSavingsInbox = () =>
			bob.page.waitForResponse((response) => {
				const { pathname, searchParams } = new URL(
					response.url(),
				);
				return (
					response.request().method() === 'GET' &&
					pathname.endsWith(savingsInbox) &&
					!searchParams.has('showRejected')
				);
			});
		const inboxLoaded = waitForSavingsInbox();
		await selectInWallet(savings.address);
		await expect(bob.walletMenuButton()).toHaveAttribute(
			'data-address',
			savings.address,
		);
		await inboxLoaded;
		// Savings' inbox has data, so the accept's refresh starts a new fetch
		// even if this one is still being read.
		await expect(
			bob.page.getByTestId('invitations-empty'),
		).toBeVisible();

		// From here only the accept's onSuccess refetches savings' inbox, and
		// it does so before it decides whether to navigate.
		const accepted = bob.page.waitForResponse(
			'**/multisig/*/accept',
		);
		const refreshed = waitForSavingsInbox();
		release();
		expect((await accepted).ok()).toBe(true);
		await refreshed;

		// Back on bob, the invitation is gone and the page never moved.
		await selectInWallet(bob.address);
		await expect(bob.walletMenuButton()).toHaveAttribute(
			'data-address',
			bob.address,
		);
		await expect(
			bob.page.getByTestId('invitations-empty'),
		).toBeVisible();
		await expect(bob.page).toHaveURL(/\/invitations$/);
		expect(
			paths.some((path) => path.startsWith('/multisig/')),
		).toBe(false);
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

	test('the creator is named from the API, not from their position', async ({
		createActor,
		createIdentity,
	}) => {
		// Alice creates with Bob's key first, so position would say Bob.
		const alice = createIdentity('alice');
		const bob = await createActor('bob');
		await signInViaApi(alice);
		const multisig = await alice.api.createMultisig({
			publicKeys: [bob.publicKey, alice.publicKey],
			weights: [1, 1],
			threshold: 2,
			name: 'Second seat',
			labels: [null, 'Alice'],
		});

		await bob.signIn();
		await bob.page.getByTestId('nav-invitations').click();
		const card = bob.invitationCard(multisig.address);
		await expect(
			card.getByTestId('invitation-invited-by'),
		).toHaveText('Invited by Alice');
		await expect(
			card.locator(`[data-address="${alice.address}"]`),
		).toBeVisible();
		await card
			.getByTestId('invitation-toggle-details')
			.click();
		await expect(
			bob.page.getByTestId('invitation-review'),
		).toContainText('Alice invited you as a signer.');
		// The Creator marker follows the API's answer too.
		await expect(
			bob.memberItem(alice.address).getByText('Creator'),
		).toBeVisible();
		await expect(
			bob.memberItem(bob.address).getByText('Creator'),
		).toHaveCount(0);
	});
});
