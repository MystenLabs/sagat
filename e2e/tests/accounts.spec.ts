// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '../support/fixtures';
import { setupMultisig } from '../support/scenarios';

test.describe('several accounts in one wallet', () => {
	test('signs in a second account and switches between them without signing again', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice', {
			otherAccounts: ['alice-savings'],
		});
		const [savings] = alice.otherAccounts;
		const bob = createIdentity('bob');
		// Only the savings account is a member.
		const multisig = await setupMultisig({
			creator: bob,
			members: [savings],
			threshold: 2,
		});
		const { page } = alice;

		await test.step('the first account has no multisigs', async () => {
			await alice.signIn();
			await expect(
				page.getByTestId('dashboard-empty'),
			).toBeVisible();
		});

		await test.step('signing in the savings account opens its multisig', async () => {
			await alice.signInAccount(savings);
			await expect(
				page.getByTestId('multisig-detail'),
			).toHaveAttribute(
				'data-multisig-address',
				multisig.address,
			);
		});

		await test.step('switching back needs no new signature', async () => {
			await alice.switchAccount(alice);
			await expect(
				alice.walletMenuButton(),
			).toHaveAttribute('data-auth-state', 'authenticated');
			await page.goto('/');
			await expect(
				page.getByTestId('dashboard-empty'),
			).toBeVisible();

			await alice.switchAccount(savings);
			await expect(
				alice.walletMenuButton(),
			).toHaveAttribute('data-auth-state', 'authenticated');
			await page.goto('/');
			await expect(
				page.getByTestId('multisig-detail'),
			).toHaveAttribute(
				'data-multisig-address',
				multisig.address,
			);
		});

		await test.step('both accounts stay signed in after a reload', async () => {
			await page.reload();
			await alice.walletMenuButton().click();
			for (const account of [alice, savings])
				await expect(
					alice.walletAccount(account.address),
				).toHaveAttribute('data-authenticated', 'true');
		});
	});

	test('creating a multisig accepts every member signed in to the session', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice', {
			otherAccounts: ['alice-savings'],
		});
		const [savings] = alice.otherAccounts;
		const carol = createIdentity('carol');
		const { page } = alice;

		await alice.signIn();
		await alice.signInAccount(savings);
		await alice.switchAccount(alice);

		await page.goto('/create');
		const members = page.getByTestId('member-row');
		await expect(
			members.nth(0).getByTestId('member-public-key-input'),
		).toHaveValue(alice.publicKey);
		for (const [index, member] of [
			savings,
			carol,
		].entries()) {
			await page.getByTestId('add-member-button').click();
			await members
				.nth(index + 1)
				.getByTestId('member-public-key-input')
				.fill(member.publicKey);
		}
		await page.getByTestId('threshold-input').fill('2');
		await page
			.getByTestId('create-multisig-submit')
			.click();

		await expect(
			page.getByTestId('multisig-detail'),
		).toBeVisible();
		await page.getByTestId('multisig-tab-overview').click();
		await expect(
			alice.memberItem(alice.address),
		).toHaveAttribute('data-status', 'accepted');
		await expect(
			alice.memberItem(savings.address),
		).toHaveAttribute('data-status', 'accepted');
		await expect(
			alice.memberItem(carol.address),
		).toHaveAttribute('data-status', 'pending');
	});
});
