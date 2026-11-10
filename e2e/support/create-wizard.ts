// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Drives the create-multisig wizard. The creator (the signed-in wallet) is
// always signer 1; `signers` are added after it, in order.
import { expect, type Page } from '@playwright/test';

export type WizardSigner = {
	/** A public key, or an address to look one up from. */
	key: string;
	label?: string;
	weight?: number;
};

export function signerRows(page: Page) {
	return page.getByTestId('create-signer-row');
}

/** From step 1 to step 2, with the given name. */
export async function nameMultisig(
	page: Page,
	name: string,
) {
	await page.getByTestId('create-name-input').fill(name);
	await page.getByTestId('create-continue').click();
	await expect(
		page.getByTestId('create-signers-step'),
	).toBeVisible();
}

/** Adds each signer as a new row at the end of the table. */
export async function addSigners(
	page: Page,
	signers: WizardSigner[],
) {
	for (const signer of signers) {
		await page.getByTestId('create-add-signer').click();
		const row = signerRows(page).last();
		if (signer.label)
			await row
				.getByTestId('create-signer-label')
				.fill(signer.label);
		await row
			.getByTestId('create-signer-key')
			.fill(signer.key);
		if (signer.weight)
			await row
				.getByTestId('create-signer-weight')
				.fill(String(signer.weight));
	}
}

export async function setThreshold(
	page: Page,
	threshold: number,
) {
	const input = page.getByTestId('create-threshold');
	await input.fill(String(threshold));
	await input.blur();
	await expect(input).toHaveValue(String(threshold));
}

/** Opens the wizard and fills it in, up to the review step. */
export async function reviewMultisig(
	page: Page,
	{
		name,
		signers,
		threshold,
	}: {
		name: string;
		signers: WizardSigner[];
		threshold: number;
	},
) {
	await page.goto('/create');
	await nameMultisig(page, name);
	await addSigners(page, signers);
	await setThreshold(page, threshold);
	await page.getByTestId('create-continue').click();
	await expect(
		page.getByTestId('create-review-step'),
	).toBeVisible();
}
