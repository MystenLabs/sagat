// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { type Page } from '@playwright/test';

import { type Chain } from '../support/chain';
import { expect, test } from '../support/fixtures';
import { setupMultisig } from '../support/scenarios';
import {
	mintTestCoin,
	publishTestCoin,
} from '../support/test-coin';

// Sends `owner` `count` KioskOwnerCaps in one transaction, sharing each
// kiosk: a cheap way to give a pod many objects that aren't coins.
async function giveKioskOwnerCaps(
	chain: Chain,
	owner: string,
	count: number,
) {
	const tx = new Transaction();
	for (let i = 0; i < count; i++) {
		const [kiosk, cap] = tx.moveCall({
			target: '0x2::kiosk::new',
		});
		tx.moveCall({
			target: '0x2::transfer::public_share_object',
			typeArguments: ['0x2::kiosk::Kiosk'],
			arguments: [kiosk],
		});
		tx.transferObjects([cap], owner);
	}
	await chain.executeAsFunder(tx);
}

async function openObjects(page: Page) {
	await page.getByTestId('multisig-tab-assets').click();
	await page.getByTestId('assets-tab-objects').click();
}

test.describe('assets', () => {
	test('an unverified coin shows only in its group, without a price', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const multisig = await setupMultisig({
			creator: alice,
			members: [createIdentity('bob')],
			threshold: 1,
		});
		await chain.fund(multisig.address);
		// TEST is outside the registry, which e2e serves empty.
		await mintTestCoin(chain, multisig.address, [
			1_000_000n,
		]);

		await alice.signIn();
		const { page } = alice;
		await page.getByTestId('multisig-tab-assets').click();
		await expect(alice.suiBalanceRow()).toHaveAttribute(
			'data-verified',
			'true',
		);
		const testCoin = page.locator(
			'[data-testid="token-row"][data-coin-type$="::test_coin::TEST_COIN"]',
		);
		await expect(testCoin).toHaveCount(0);

		const group = page.getByTestId(
			'unverified-tokens-toggle',
		);
		await expect(group).toHaveAttribute('data-count', '1');
		await group.click();
		await expect(
			testCoin.getByTestId('token-unverified'),
		).toBeVisible();
		await expect(
			testCoin.getByTestId('token-price'),
		).toHaveText('No price');
	});

	test('objects come a page at a time, without coins', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const multisig = await setupMultisig({
			creator: alice,
			members: [createIdentity('bob')],
			threshold: 1,
		});
		await chain.fund(multisig.address);
		await giveKioskOwnerCaps(chain, multisig.address, 21);

		await alice.signIn();
		const { page } = alice;
		await openObjects(page);
		await expect(page).toHaveURL(/[?&]view=objects\b/);
		const rows = page.getByTestId('object-row');
		await expect(rows).toHaveCount(20);
		const firstPage = await rows.evaluateAll((els) =>
			els.map((el) => el.getAttribute('data-object-id')),
		);

		await page.getByTestId('objects-next-page').click();
		await expect(
			page.getByTestId('objects-page'),
		).toHaveAttribute('data-page', '2');
		await expect(rows).toHaveCount(1);
		const last = await rows.getAttribute('data-object-id');
		// Every cap once, and the SUI coin nowhere.
		expect(new Set([...firstPage, last]).size).toBe(21);
		await expect(
			page.getByTestId('objects-next-page'),
		).toBeDisabled();

		await page.getByTestId('objects-previous-page').click();
		await expect(rows).toHaveCount(20);
		await expect(
			page.getByTestId('objects-previous-page'),
		).toBeDisabled();
	});

	test('the UpgradeCap filter lists only the UpgradeCap', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const multisig = await setupMultisig({
			creator: alice,
			members: [createIdentity('bob')],
			threshold: 1,
		});
		// Something besides the UpgradeCap, for the filter to leave out.
		await giveKioskOwnerCaps(chain, multisig.address, 1);
		await publishTestCoin(chain, undefined, {
			upgradeCapTo: multisig.address,
		});

		await alice.signIn();
		const { page } = alice;
		await openObjects(page);
		const rows = page.getByTestId('object-row');
		await expect(rows).toHaveCount(2);

		await page.getByTestId('objects-type-select').click();
		await page
			.locator(
				'[data-testid="objects-type-option"][data-value="upgradeCap"]',
			)
			.click();
		await expect(rows).toHaveCount(1);
		await expect(rows).toHaveAttribute(
			'data-kind',
			'upgradeCap',
		);
	});

	test('an UpgradeCap shows its package, version and policy', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const multisig = await setupMultisig({
			creator: alice,
			members: [createIdentity('bob')],
			threshold: 1,
		});
		const coin = await publishTestCoin(chain, undefined, {
			upgradeCapTo: multisig.address,
		});
		const packageId = normalizeSuiAddress(
			coin.type.split('::')[0],
		);

		await alice.signIn();
		const { page } = alice;
		await openObjects(page);
		const cap = page.locator(
			'[data-testid="object-row"][data-kind="upgradeCap"]',
		);
		await expect(
			cap.getByTestId('object-subtitle-id'),
		).toHaveAttribute('data-id', packageId);
		const subtitle = cap.getByTestId('object-subtitle');
		await expect(subtitle).toContainText('version 1');
		await expect(subtitle).toContainText('Compatible');
	});
});
