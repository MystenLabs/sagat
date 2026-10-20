// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	addSigners,
	nameMultisig,
	signerRows,
} from '../support/create-wizard';
import { expect, test } from '../support/fixtures';

// The wizard at phone width: Cancel moves into the card, the stepper
// becomes one line, and the review table becomes a list.
test('the wizard fits a phone', async ({
	createActor,
	createIdentity,
}) => {
	const alice = await createActor('alice');
	const bob = createIdentity('bob');
	const { page } = alice;

	await alice.signIn();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/create');

	await expect(
		page.getByTestId('create-cancel'),
	).toBeHidden();
	await expect(
		page.getByTestId('create-stepper-compact'),
	).toHaveText('Step 1 of 3 · Name');
	await expect(
		page.getByTestId('create-step-1'),
	).toBeHidden();

	await nameMultisig(page, 'Pocket');
	await expect(
		page.getByTestId('create-stepper-compact'),
	).toContainText('Step 2 of 3');
	await addSigners(page, [
		{ label: 'Bob', key: bob.publicKey },
	]);
	// The preview's numbers show under the stepper while its card is
	// below the form.
	await expect(
		page.getByTestId('create-preview-strip').locator('dd'),
	).toHaveText(['2', '2', '1 of 2', /^0x/]);
	await expect(signerRows(page).first()).toContainText(
		'Weight',
	);

	await page.getByTestId('create-continue').click();
	await expect(
		page.getByTestId('create-review-list'),
	).toBeVisible();
	await expect(
		page.getByTestId('create-review-item'),
	).toHaveCount(2);
	await expect(
		page.getByTestId('create-review-signer-name').first(),
	).toBeHidden();

	// Cancel in the footer leaves the wizard.
	await page.getByTestId('create-cancel-footer').click();
	await expect(page).toHaveURL(/\/$/);
});
