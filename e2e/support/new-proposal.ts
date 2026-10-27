// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Drives the new-proposal wizard: Type, Details (a transfer or pasted
// bytes), Review, then propose. Proposing signs with the signed-in wallet.
import {
	MIST_PER_SUI,
	normalizeStructTag,
} from '@mysten/sui/utils';
import {
	expect,
	type Page,
	type Request,
} from '@playwright/test';

import {
	newProposalPath,
	type ProposalType,
} from '../../app/src/lib/new-proposal';
import { randomAddress, type Chain } from './chain';
import { E2E } from './env';
import { type Fixtures } from './fixtures';
import { setupMultisig } from './scenarios';

/**
 * Alice and Bob share an account; Alice is signed in on it. With
 * threshold 1, Alice's proposal is ready to execute as soon as she makes
 * it. `fund: false` leaves the account without SUI; `rejectSigning` has
 * Alice's wallet decline every transaction.
 */
export async function sharedAccount(
	{ createActor, createIdentity, chain }: Fixtures,
	threshold: 1 | 2,
	{
		fund = true,
		rejectSigning,
	}: { fund?: boolean; rejectSigning?: boolean } = {},
) {
	const alice = await createActor('alice', {
		rejectSigning,
	});
	const bob = createIdentity('bob');
	const multisig = await setupMultisig({
		creator: alice,
		members: [bob],
		threshold,
	});
	if (fund) await chain.fund(multisig.address);
	await alice.signIn();
	return { alice, bob, multisig };
}

/** Every POST /proposals the page sends, as it sends it. */
export function recordCreates(page: Page) {
	const creates: Request[] = [];
	page.on('request', (request) => {
		if (isCreateRequest(request)) creates.push(request);
	});
	return creates;
}

export function isCreateRequest(request: Request) {
	const url = new URL(request.url());
	return (
		request.method() === 'POST' &&
		url.origin === E2E.apiUrl &&
		url.pathname.endsWith('/proposals')
	);
}

/** The toasts of `type` on the page. */
export function toast(
	page: Page,
	type: 'success' | 'error',
) {
	return page.locator(
		`[data-sonner-toast][data-type="${type}"]`,
	);
}

/**
 * Pastes a 1 SUI transfer from `address` with `title`, and waits on
 * Review for its simulation.
 */
export async function bytesToReview(
	page: Page,
	chain: Chain,
	address: string,
	title: string,
) {
	await openNewProposal(page, address, { type: 'bytes' });
	await pasteBytes(
		page,
		await chain.buildSuiTransfer({
			sender: address,
			recipient: randomAddress(),
			amount: MIST_PER_SUI,
		}),
		title,
	);
	await reviewBytes(page);
	await expectSimulation(page, 'success');
}

/** The simulated balance change of `address` on Review. */
export function balanceChange(page: Page, address: string) {
	return page.locator(
		`[data-testid="balance-change"][data-address="${address}"]`,
	);
}

/** The amount's error on the transfer's Details. */
export function amountError(page: Page) {
	return page.getByTestId('transfer-amount-error');
}

/** Executes the one proposal on the page and returns its digest. */
export async function executeProposal(page: Page) {
	const card = page.getByTestId('proposal-card');
	await expect(card).toHaveAttribute(
		'data-status',
		'ready',
	);
	await card.getByTestId('execute-proposal-button').click();
	await expect(card).toHaveAttribute(
		'data-status',
		'executed',
	);
	return (await card.getAttribute('data-digest'))!;
}

/**
 * Opens the wizard on its own route. With `type` it lands on Details for
 * that type; `coinType` preselects the asset to send.
 */
export async function openNewProposal(
	page: Page,
	address: string,
	params: { type?: ProposalType; coinType?: string } = {},
) {
	await page.goto(newProposalPath(address, params));
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
	// The wizard's route: /multisig/<address>/proposals/new.
	const address = new URL(page.url()).pathname.split(
		'/',
	)[2];
	await page.getByTestId('review-submit').click();
	await expectOnProposals(page, address);
	await expect(
		toast(page, 'success').filter({
			hasText: 'Proposal created',
		}),
	).toBeVisible();
}

/**
 * On `address`'s proposals page, with its tab active in the sidebar.
 */
export async function expectOnProposals(
	page: Page,
	address: string,
) {
	await expect(page).toHaveURL(
		(url) =>
			url.pathname === `/multisig/${address}/proposals`,
	);
	await expect(
		page.getByTestId('multisig-tab-proposals'),
	).toHaveAttribute('data-active');
}
