// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersonalMessages } from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';

import { expect, test } from '../support/fixtures';
import {
	setupMultisig,
	signInViaApi,
} from '../support/scenarios';

test.describe('overview and signers', () => {
	test('show the setup, each key by its label and weight, and who created it', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const carol = createIdentity('carol');
		// Carol is unnamed and hasn't answered yet.
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob, carol],
			weights: [2, 1, 1],
			threshold: 3,
			name: 'Treasury',
			labels: ['Alice', 'Bob', null],
			accept: false,
		});
		await bob.api.acceptMultisigInvite(multisig.address, {
			signature: await bob.signMessage(
				PersonalMessages.acceptMultisigInvitation(
					multisig.address,
				),
			),
		});
		await signInViaApi(alice);
		const saved = await alice.api.getMultisig(
			multisig.address,
		);
		expect(saved.createdAt).not.toBeNull();

		await alice.signIn();
		const { page } = alice;
		await expect(
			page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			multisig.address,
		);

		await test.step('the overview sums the account up', async () => {
			await page
				.getByTestId('multisig-tab-overview')
				.click();
			await expect(
				page.getByRole('heading', { level: 1 }),
			).toHaveText('Overview');
			// The account is the last crumb.
			await expect(
				page
					.getByRole('navigation', { name: 'Breadcrumb' })
					.locator('[aria-current="page"]'),
			).toHaveText('Treasury');
			await expect(
				page.getByTestId('multisig-threshold'),
			).toHaveText('3 of 4');
			await expect(
				page.getByTestId('account-created'),
			).toHaveAttribute(
				'data-created-at',
				saved.createdAt!,
			);
			// The creator is the signed-in key, named by its label.
			await expect(
				page.getByTestId('account-created-by'),
			).toHaveText('Alice (you)');
		});

		await test.step('the signers list each key with its label and weight', async () => {
			await page
				.getByTestId('multisig-tab-signers')
				.click();
			await expect(
				page.getByRole('heading', { level: 1 }),
			).toHaveText('Signers');
			await expect(
				page.getByTestId('signers-summary'),
			).toHaveText('2 of 3 accepted');
			await expect(
				page.getByTestId('signers-notice'),
			).toHaveCount(0);

			const you = alice.memberItem(alice.address);
			await expect(
				you.getByTestId('member-label'),
			).toHaveText('Alice');
			await expect(you).toContainText('(you)');
			await expect(
				you.getByTestId('member-weight'),
			).toHaveText('2');
			await expect(you).toHaveAttribute(
				'data-status',
				'accepted',
			);

			const him = alice.memberItem(bob.address);
			await expect(
				him.getByTestId('member-label'),
			).toHaveText('Bob');
			await expect(him).not.toContainText('(you)');
			await expect(
				him.getByTestId('member-weight'),
			).toHaveText('1');
			await expect(him).toHaveAttribute(
				'data-status',
				'accepted',
			);

			// An unnamed key goes by its short address, still invited.
			const her = alice.memberItem(carol.address);
			await expect(
				her.getByTestId('member-label'),
			).toHaveCount(0);
			await expect(her).toContainText(
				formatAddress(carol.address),
			);
			await expect(her).toHaveAttribute(
				'data-status',
				'pending',
			);
			await expect(her).toContainText('Invited');

			// The setup card repeats the numbers and the creator.
			const setup = page.getByTestId('account-setup');
			await expect(
				setup.getByTestId('setup-threshold'),
			).toHaveText('3 of 4');
			await expect(
				setup.getByTestId('setup-created'),
			).toHaveAttribute(
				'data-created-at',
				saved.createdAt!,
			);
			await expect(
				setup.getByTestId('setup-created-by'),
			).toHaveText('Alice (you)');
			// Suiscan doesn't index localnet, so only the download shows.
			await expect(
				setup.getByTestId('setup-explorer-link'),
			).toHaveCount(0);
			await expect(
				setup.getByTestId('setup-download'),
			).toBeVisible();
		});
	});

	test('name the creator for other members and call out a rejected signer', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = createIdentity('alice');
		const bob = await createActor('bob');
		const carol = createIdentity('carol');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob, carol],
			threshold: 2,
			name: 'Grants',
			labels: ['Alice', 'Bob', null],
			accept: false,
		});
		await bob.api.acceptMultisigInvite(multisig.address, {
			signature: await bob.signMessage(
				PersonalMessages.acceptMultisigInvitation(
					multisig.address,
				),
			),
		});
		await carol.api.rejectMultisigInvite(multisig.address, {
			signature: await carol.signMessage(
				PersonalMessages.rejectMultisigInvitation(
					multisig.address,
				),
			),
		});

		await bob.signIn();
		const { page } = bob;
		await expect(
			page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			multisig.address,
		);

		await page.getByTestId('multisig-tab-overview').click();
		await expect(
			page.getByTestId('account-created-by'),
		).toHaveText('Alice');

		await page.getByTestId('multisig-tab-signers').click();
		// Alice and Bob together still reach the threshold of 2.
		const notice = page.getByTestId('signers-notice');
		await expect(notice).toHaveAttribute(
			'data-tone',
			'warning',
		);
		await expect(notice).toContainText(
			`${formatAddress(carol.address)} rejected the invitation to join this account. The other signers can still reach the threshold.`,
		);
		await expect(
			page.getByTestId('signers-summary'),
		).toHaveText(
			`2 of 3 accepted · ${formatAddress(carol.address)} rejected`,
		);
		await expect(
			bob.memberItem(carol.address),
		).toHaveAttribute('data-status', 'rejected');
		await expect(bob.memberItem(bob.address)).toContainText(
			'(you)',
		);
		await expect(
			page.getByTestId('setup-created-by'),
		).toHaveText('Alice');
	});
	test('add and remove an external proposer', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const payments = createIdentity('payments');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 1,
		});

		await alice.signIn();
		const { page } = alice;
		await expect(
			page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			multisig.address,
		);
		await page.getByTestId('multisig-tab-signers').click();

		const card = page.getByTestId('proposers-card');
		await expect(
			card.getByTestId('proposers-empty'),
		).toBeVisible();

		// Adding signs a message with the wallet.
		await card.getByTestId('add-proposer-button').click();
		const add = page.getByRole('dialog', {
			name: 'Add Proposer',
		});
		await add
			.getByLabel('Proposer Address')
			.fill(payments.address);
		await add
			.getByRole('button', {
				name: 'Add Proposer',
				exact: true,
			})
			.click();
		const item = card.getByTestId('proposer-item');
		await expect(item).toHaveCount(1);
		await expect(item).toHaveAttribute(
			'data-address',
			payments.address,
		);
		await expect(item).toContainText(
			formatAddress(payments.address),
		);
		await expect(
			card.getByTestId('proposers-empty'),
		).toHaveCount(0);

		// Removing asks first, naming the whole address.
		const remove = item.getByTestId(
			'remove-proposer-button',
		);
		await expect(remove).toHaveAccessibleName(
			`Remove ${formatAddress(payments.address)}`,
		);
		await remove.click();
		const confirm = page.getByRole('dialog', {
			name: 'Remove Proposer',
		});
		await expect(confirm).toContainText(payments.address);
		await confirm
			.getByRole('button', {
				name: 'Remove Proposer',
				exact: true,
			})
			.click();
		await expect(
			card.getByTestId('proposer-item'),
		).toHaveCount(0);
		await expect(
			card.getByTestId('proposers-empty'),
		).toBeVisible();
	});
});
