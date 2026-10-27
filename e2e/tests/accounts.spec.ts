// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	addSigners,
	nameMultisig,
	setThreshold,
	signerRows,
} from '../support/create-wizard';
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
			const empty = page.getByTestId('dashboard-empty');
			await expect(empty).toBeVisible();
			const header = page.getByTestId('app-header');
			await expect(
				header.getByTestId('multisig-switcher-empty'),
			).toBeVisible();
			await expect(
				header.getByTestId('create-account-button'),
			).toBeVisible();

			// The empty state leads to invitations and to creating one.
			await page.getByTestId('view-invitations').click();
			await expect(
				page.getByTestId('invitations-page'),
			).toBeVisible();
			await page.goto('/');
			await page
				.getByTestId('create-first-multisig')
				.click();
			await expect(
				page.getByTestId('create-page'),
			).toBeVisible();
			await page.goto('/');
		});

		await test.step('a declined signature keeps the wallet while another account is signed in', async () => {
			await page.evaluate(() => {
				window.__e2eWallet!.declineSign = true;
			});
			await alice.openWalletMenu();
			await alice
				.walletAccount(savings.address)
				.getByTestId('wallet-account-sign')
				.click();
			await expect(
				alice.toast('You declined the request in'),
			).toBeVisible();
			// The sign switched to the savings account first.
			await expect(
				alice.walletMenuButton(),
			).toHaveAttribute('data-address', savings.address);
			await expect(
				alice.walletMenuButton(),
			).toHaveAttribute(
				'data-auth-state',
				'unauthenticated',
			);
			await expect(
				page.getByTestId('auth-prompt'),
			).toBeVisible();
			await expect(alice.declinedLine()).toBeVisible();

			// The note was that account's: a switch takes it away.
			await alice.switchAccount(alice);
			await expect(
				alice.walletMenuButton(),
			).toHaveAttribute('data-auth-state', 'authenticated');
			await alice.switchAccount(savings);
			await expect(
				page.getByTestId('auth-prompt'),
			).toBeVisible();
			await expect(alice.declinedLine()).toHaveCount(0);

			await page.evaluate(() => {
				window.__e2eWallet!.declineSign = false;
			});
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
			await alice.openWalletMenu();
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
		await nameMultisig(page, 'Shared');
		await expect(
			signerRows(page)
				.first()
				.getByTestId('create-signer-key'),
		).toHaveValue(alice.publicKey);
		await addSigners(page, [
			{ key: savings.publicKey },
			{ key: carol.publicKey },
		]);
		await setThreshold(page, 2);
		await page.getByTestId('create-continue').click();
		await page.getByTestId('create-submit').click();

		await expect(
			page.getByTestId('multisig-detail'),
		).toBeVisible();
		await page.getByTestId('multisig-tab-signers').click();
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
