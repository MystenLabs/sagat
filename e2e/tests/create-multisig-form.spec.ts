// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';
import {
	multisigAddressOf,
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

		await alice.signIn();
		await page.getByTestId('create-first-multisig').click();
		await page.getByTestId('add-member-button').click();

		await test.step('a registered address', async () => {
			await members
				.nth(1)
				.getByTestId('member-lookup-button')
				.click();
			await modal
				.getByTestId('address-lookup-input')
				.fill(bob.address);
			await modal
				.getByTestId('address-lookup-submit')
				.click();
			await expect(
				modal.getByTestId('address-lookup-result'),
			).toHaveText(bob.publicKey);
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
			await expect(
				modal.getByTestId('address-lookup-error'),
			).toBeVisible();
			await expect(
				modal.getByTestId('address-lookup-result'),
			).toHaveCount(0);
		});
	});
});
