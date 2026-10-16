// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';
import {
	multisigAddressOf,
	setupMultisig,
	signInViaApi,
} from '../support/scenarios';

test.describe('create multisig form', () => {
	test('refuses invalid members until they are fixed', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const { page } = alice;
		const members = page.getByTestId('member-row');
		const submit = page.getByTestId(
			'create-multisig-submit',
		);
		const addressError = page.getByTestId(
			'multisig-address-error',
		);

		await alice.signIn();
		await page.getByTestId('create-first-multisig').click();
		await page.getByTestId('add-member-button').click();
		const bobKey = members
			.nth(1)
			.getByTestId('member-public-key-input');

		await test.step('an invalid public key', async () => {
			await bobKey.fill('not-a-public-key');
			await expect(
				members
					.nth(1)
					.getByTestId('member-public-key-error'),
			).toBeVisible();
			await expect(submit).toBeDisabled();

			await bobKey.fill(bob.publicKey);
			await expect(
				members
					.nth(1)
					.getByTestId('member-public-key-error'),
			).toHaveCount(0);
			await expect(submit).toBeEnabled();
		});

		await test.step('the same member twice', async () => {
			await page.getByTestId('add-member-button').click();
			await members
				.nth(2)
				.getByTestId('member-public-key-input')
				.fill(bob.publicKey);
			await expect(addressError).toBeVisible();
			await expect(submit).toBeDisabled();

			await members
				.nth(2)
				.getByTestId('member-remove-button')
				.click();
			await expect(members).toHaveCount(2);
			await expect(addressError).toHaveCount(0);
			await expect(submit).toBeEnabled();
		});

		await test.step('a threshold above the total weight', async () => {
			await page.getByTestId('threshold-input').fill('3');
			await expect(addressError).toBeVisible();
			await expect(submit).toBeDisabled();

			await page.getByTestId('threshold-input').fill('2');
			await expect(
				page.getByTestId('multisig-address-preview'),
			).toHaveText(
				multisigAddressOf(
					[{ identity: alice }, { identity: bob }],
					2,
				),
			);
			await expect(submit).toBeEnabled();
		});

		// A weight is a single byte in the multisig public key.
		await test.step('a weight above 255', async () => {
			const bobWeight = members
				.nth(1)
				.getByTestId('member-weight-input');
			await bobWeight.fill('256');
			await expect(
				members.nth(1).getByTestId('member-weight-error'),
			).toBeVisible();
			await expect(addressError).toBeVisible();
			await expect(submit).toBeDisabled();

			await bobWeight.fill('255');
			await expect(
				members.nth(1).getByTestId('member-weight-error'),
			).toHaveCount(0);
			await expect(
				page.getByTestId('multisig-address-preview'),
			).toHaveText(
				multisigAddressOf(
					[
						{ identity: alice },
						{ identity: bob, weight: 255 },
					],
					2,
				),
			);
			await expect(submit).toBeEnabled();
		});
	});

	test('keeps between two and ten members', async ({
		createActor,
	}) => {
		const alice = await createActor('alice');
		const { page } = alice;
		const members = page.getByTestId('member-row');
		const addMember = page.getByTestId('add-member-button');
		const removeButtons = page.getByTestId(
			'member-remove-button',
		);

		await alice.signIn();
		await page.getByTestId('create-first-multisig').click();

		await test.step('the creator cannot be removed', async () => {
			await expect(members).toHaveCount(1);
			await expect(removeButtons).toHaveCount(0);
			await expect(
				page.getByTestId('create-multisig-submit'),
			).toBeDisabled();
		});

		await test.step('neither can the second member', async () => {
			await addMember.click();
			await expect(members).toHaveCount(2);
			await expect(removeButtons).toHaveCount(0);
		});

		await test.step('the tenth member is the last', async () => {
			for (let i = 2; i < 10; i++) await addMember.click();
			await expect(members).toHaveCount(10);
			await expect(addMember).toHaveCount(0);
			// Everyone but the creator can go now.
			await expect(removeButtons).toHaveCount(9);

			await removeButtons.last().click();
			await expect(members).toHaveCount(9);
			await expect(addMember).toBeVisible();
		});
	});

	test('refuses a multisig that already exists', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const existing = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 2,
			accept: false,
		});
		const { page } = alice;
		const submit = page.getByTestId(
			'create-multisig-submit',
		);

		await alice.signIn();
		await page.goto('/create');
		await page.getByTestId('add-member-button').click();
		await page
			.getByTestId('member-row')
			.nth(1)
			.getByTestId('member-public-key-input')
			.fill(bob.publicKey);
		await page.getByTestId('threshold-input').fill('2');
		await expect(
			page.getByTestId('multisig-address-preview'),
		).toHaveText(existing.address);
		await submit.click();

		// The API refuses it and the form stays, ready for another try.
		await expect(
			page.locator(
				'[data-sonner-toast][data-type="error"]',
			),
		).toContainText('already exists');
		await expect(page).toHaveURL(/\/create$/);
		await expect(submit).toBeEnabled();
	});

	test("looks up a member's public key by address", async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		// Signing in registers Bob's address with the API.
		const bob = createIdentity('bob');
		await signInViaApi(bob);
		const { page } = alice;
		const members = page.getByTestId('member-row');
		const modal = page.getByTestId('address-lookup-modal');
		const lookupError = modal.getByTestId(
			'address-lookup-error',
		);
		const lookupResult = modal.getByTestId(
			'address-lookup-result',
		);

		await alice.signIn();
		await page.getByTestId('create-first-multisig').click();
		await page.getByTestId('add-member-button').click();
		await members
			.nth(1)
			.getByTestId('member-lookup-button')
			.click();

		await test.step('a malformed address', async () => {
			await modal
				.getByTestId('address-lookup-input')
				.fill('0x123');
			await modal
				.getByTestId('address-lookup-submit')
				.click();
			await expect(lookupError).toBeVisible();
			await expect(lookupResult).toHaveCount(0);
		});

		await test.step('a registered address', async () => {
			await modal
				.getByTestId('address-lookup-input')
				.fill(bob.address);
			await modal
				.getByTestId('address-lookup-submit')
				.click();
			await expect(lookupResult).toHaveText(bob.publicKey);
			await expect(lookupError).toHaveCount(0);
			await modal
				.getByTestId('address-lookup-select')
				.click();

			await expect(modal).toBeHidden();
			await expect(
				members
					.nth(1)
					.getByTestId('member-public-key-input'),
			).toHaveValue(bob.publicKey);
		});

		// Public networks are blocked in tests, so only the API can know it.
		await test.step('an unknown address', async () => {
			await page.getByTestId('add-member-button').click();
			await members
				.nth(2)
				.getByTestId('member-lookup-button')
				.click();
			await modal
				.getByTestId('address-lookup-input')
				.fill(randomAddress());
			await modal
				.getByTestId('address-lookup-submit')
				.click();
			await expect(lookupError).toBeVisible();
			await expect(lookupResult).toHaveCount(0);
		});
	});
});
