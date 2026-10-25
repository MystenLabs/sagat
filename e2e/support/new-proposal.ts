// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Drives the new-proposal wizard: Type, Details (a transfer or pasted
// bytes), Review, then propose. Proposing signs with the signed-in wallet.
import { normalizeStructTag } from '@mysten/sui/utils';
import { expect, type Page } from '@playwright/test';

export type ProposalType = 'transfer' | 'bytes';

/**
 * Opens the wizard on its own route. With `type` it lands on Details for
 * that type; `coinType` preselects the asset to send.
 */
export async function openNewProposal(
	page: Page,
	address: string,
	params: { type?: ProposalType; coinType?: string } = {},
) {
	const query = new URLSearchParams();
	if (params.type) query.set('type', params.type);
	if (params.coinType) query.set('asset', params.coinType);
	const search = query.toString();
	await page.goto(
		`/multisig/${address}/proposals/new${search ? `?${search}` : ''}`,
	);
	await expect(
		page.getByTestId(
			params.type ? `${params.type}-step` : 'type-step',
		),
	).toBeVisible();
}

/** From the account page's "New proposal" button to the Type step. */
export async function clickNewProposal(page: Page) {
	await page.getByTestId('new-proposal-button').click();
	await expect(page.getByTestId('type-step')).toBeVisible();
}

/** From the Type step to Details for `type`. */
export async function chooseType(
	page: Page,
	type: ProposalType,
) {
	await page.getByTestId(`proposal-type-${type}`).click();
	await page.getByTestId('type-continue').click();
	await expect(
		page.getByTestId(`${type}-step`),
	).toBeVisible();
}

/**
 * Chooses `coinType` from the Details step's asset list. The type is
 * matched in its normalized form, so `0x2::sui::SUI` finds the full-length
 * one the chain returns.
 */
export async function chooseAsset(
	page: Page,
	coinType: string,
) {
	const normalized = normalizeStructTag(coinType);
	await page.getByTestId('transfer-asset-select').click();
	await page
		.locator(
			`[data-testid="transfer-asset-option"][data-coin-type="${normalized}"]`,
		)
		.click();
	await expect(
		page.getByTestId('transfer-asset-select'),
	).toHaveAttribute('data-coin-type', normalized);
}

/**
 * Fills the transfer's fields. Each field is left after filling, so its
 * error shows as it would for a user. Without `title` the generated one
 * stays.
 */
export async function fillTransfer(
	page: Page,
	{
		coinType,
		amount,
		recipient,
		title,
	}: {
		coinType?: string;
		amount: string;
		recipient: string;
		title?: string;
	},
) {
	if (coinType) await chooseAsset(page, coinType);
	const amountInput = page.getByTestId(
		'transfer-amount-input',
	);
	await amountInput.fill(amount);
	await amountInput.blur();
	const recipientInput = page.getByTestId(
		'transfer-recipient-input',
	);
	await recipientInput.fill(recipient);
	await recipientInput.blur();
	if (title !== undefined) {
		const titleInput = page.getByTestId(
			'proposal-title-input',
		);
		await titleInput.fill(title);
		await titleInput.blur();
	}
}

/** From the transfer's Details to Review. */
export async function reviewTransfer(page: Page) {
	await page.getByTestId('transfer-review').click();
	await expect(
		page.getByTestId('review-step'),
	).toBeVisible();
}

/** Pastes `bytes` and the title on the bytes Details step. */
export async function pasteBytes(
	page: Page,
	bytes: string,
	title?: string,
) {
	await page.getByTestId('bytes-input').fill(bytes);
	if (title !== undefined) {
		const titleInput = page.getByTestId(
			'proposal-title-input',
		);
		await titleInput.fill(title);
		await titleInput.blur();
	}
}

/** From the bytes Details to Review. */
export async function reviewBytes(page: Page) {
	await page.getByTestId('bytes-review').click();
	await expect(
		page.getByTestId('review-step'),
	).toBeVisible();
}

/** Waits for Review's simulation to settle with `result`. */
export async function expectSimulation(
	page: Page,
	result: 'success' | 'failure',
) {
	await expect(
		page.getByTestId('transaction-preview-result'),
	).toHaveAttribute('data-result', result);
}

/**
 * Proposes from Review, which signs with the wallet, and lands on the
 * account's proposals with the "Proposal created" toast.
 */
export async function proposeAndSign(page: Page) {
	await page.getByTestId('review-submit').click();
	await expectOnProposals(page);
	await expect(
		page.locator(
			'[data-sonner-toast][data-type="success"]',
			{
				hasText: 'Proposal created',
			},
		),
	).toBeVisible();
}

/** On the account's proposals page, with its tab active in the sidebar. */
export async function expectOnProposals(page: Page) {
	await expect(page).toHaveURL(
		/\/multisig\/0x[0-9a-f]+\/proposals$/,
	);
	await expect(
		page.getByTestId('multisig-tab-proposals'),
	).toHaveAttribute('data-active');
}
