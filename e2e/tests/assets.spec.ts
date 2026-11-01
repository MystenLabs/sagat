// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { type Page, type Request } from '@playwright/test';

import { type Actor } from '../support/actor';
import { type Chain } from '../support/chain';
import { E2E } from '../support/env';
import { expect, test } from '../support/fixtures';
import { type Identity } from '../support/identity';
import { setupMultisig } from '../support/scenarios';
import {
	giveManyCoinTypes,
	mintTestCoin,
	publishTestCoin,
} from '../support/test-coin';

// Whether `request` is a call of the node's `method` that mentions `text`.
// The body of a gRPC-web request is base64.
function asksFor(
	request: Request,
	method: string,
	text: string,
) {
	return (
		request.url().endsWith(`/${method}`) &&
		Buffer.from(request.postData() ?? '', 'base64')
			.toString('latin1')
			.includes(text)
	);
}

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

// Signs `creator` in to a pod holding an UpgradeCap, and returns the pod's
// Objects tab and the id of the package the cap upgrades.
async function signInWithUpgradeCap(
	creator: Actor,
	member: Identity,
	chain: Chain,
) {
	const multisig = await setupMultisig({
		creator,
		members: [member],
		threshold: 1,
	});
	const coin = await publishTestCoin(chain, undefined, {
		upgradeCapTo: multisig.address,
	});
	await creator.signIn();
	return {
		objectsUrl: `/multisig/${multisig.address}/assets?view=objects`,
		packageId: normalizeSuiAddress(
			coin.type.split('::')[0],
		),
	};
}

// The short package id on the UpgradeCap's row.
function packageIdTrigger(page: Page) {
	return page
		.locator(
			'[data-testid="object-row"][data-kind="upgradeCap"]',
		)
		.getByTestId('object-subtitle-id')
		.getByRole('button');
}

// Has the app call localnet testnet, so its explorer links show: Suiscan
// doesn't index localnet.
async function callLocalnetTestnet(page: Page) {
	await page.route(
		/fullnode\.testnet\.sui\.io/,
		async (route) => {
			const { pathname } = new URL(route.request().url());
			const response = await route.fetch({
				url: E2E.rpcUrl + pathname,
			});
			await route.fulfill({
				response,
				headers: {
					...response.headers(),
					'access-control-allow-origin': '*',
				},
			});
		},
	);
	await page.evaluate(() =>
		localStorage.setItem('SuiNetwork', 'testnet'),
	);
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
		// A fresh load: the overview's rows would have fetched the coin's
		// metadata already.
		await page.goto('about:blank');
		const objectListings: string[] = [];
		const testCoinLookups: string[] = [];
		page.on('request', (request) => {
			if (request.url().endsWith('/ListOwnedObjects'))
				objectListings.push(request.url());
			if (
				asksFor(
					request,
					'GetCoinInfo',
					'::test_coin::TEST_COIN',
				)
			)
				testCoinLookups.push(request.url());
		});
		await page.goto(`/multisig/${multisig.address}/assets`);
		await expect(alice.suiBalanceRow()).toHaveAttribute(
			'data-verified',
			'true',
		);
		// SUI's details are in, so an eager lookup would have gone out too.
		await expect(
			alice
				.suiBalanceRow()
				.getByTestId('token-send-button'),
		).toBeEnabled();
		expect(testCoinLookups).toEqual([]);
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
		await expect(
			testCoin.getByTestId('token-balance'),
		).toHaveText('1');
		await expect(
			testCoin.getByTestId('token-send-button'),
		).toBeEnabled();
		// With coins to show, the tokens never ask for the objects.
		expect(objectListings).toEqual([]);
	});

	test('the unverified group shows fifty rows at a time, looking up only those', async ({
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
		await giveManyCoinTypes(chain, multisig.address, 51);

		await alice.signIn();
		const { page } = alice;
		await page.goto('about:blank');
		let lookups = 0;
		page.on('request', (request) => {
			if (request.url().endsWith('/GetCoinInfo')) lookups++;
		});
		await page.goto(`/multisig/${multisig.address}/assets`);
		await expect(
			alice
				.suiBalanceRow()
				.getByTestId('token-send-button'),
		).toBeEnabled();
		expect(lookups).toBe(1);

		const group = page.getByTestId(
			'unverified-tokens-toggle',
		);
		await expect(group).toHaveAttribute('data-count', '51');
		await group.click();
		const unverified = page.locator(
			'[data-testid="token-row"][data-verified="false"]',
		);
		await expect(unverified).toHaveCount(50);
		await expect(group).toHaveAttribute('data-count', '51');
		await expect.poll(() => lookups).toBe(51);

		const loadMore = page.getByTestId(
			'assets-tokens-load-more',
		);
		await loadMore.click();
		await expect(unverified).toHaveCount(51);
		await expect.poll(() => lookups).toBe(52);
		await expect(loadMore).toHaveCount(0);
	});

	test('without the price list every coin is listed with its details, unmarked', async ({
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
		await mintTestCoin(chain, multisig.address, [
			1_000_000n,
		]);

		await alice.signIn();
		const { page } = alice;
		await alice.failRecognizedCoins();
		await page.goto(`/multisig/${multisig.address}/assets`);
		const sends = page.getByTestId('token-send-button');
		await expect(sends).toHaveCount(2);
		await expect(sends.nth(0)).toBeEnabled();
		await expect(sends.nth(1)).toBeEnabled();
		await expect(
			page.getByTestId('unverified-tokens-toggle'),
		).toHaveCount(0);
		await expect(
			page.getByTestId('token-unverified'),
		).toHaveCount(0);
	});

	test('without a connection a pod not loaded yet stays loading, not empty', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const first = await setupMultisig({
			creator: alice,
			members: [createIdentity('bob')],
			threshold: 1,
		});
		const second = await setupMultisig({
			creator: alice,
			members: [createIdentity('carol')],
			threshold: 1,
		});

		await alice.signIn();
		const { page } = alice;
		await page.goto(`/multisig/${first.address}/assets`);
		const noAssets = page.getByTestId('assets-empty');
		await expect(noAssets).toBeVisible();

		await page.evaluate(() =>
			window.dispatchEvent(new Event('offline')),
		);
		await page.getByTestId('multisig-switcher').click();
		await page
			.locator(
				`[data-testid="multisig-switcher-option"][data-address="${second.address}"]`,
			)
			.click();
		await expect(
			page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			second.address,
		);
		await expect(
			page.getByTestId('assets-tokens-loading'),
		).toBeVisible();
		await expect(noAssets).toHaveCount(0);
		await expect(
			page.getByTestId('assets-tokens-empty'),
		).toHaveCount(0);
		await expect(
			page.getByTestId('account-value-amount'),
		).toHaveCount(0);

		// Back online it finds out, and this one really holds nothing.
		await page.evaluate(() =>
			window.dispatchEvent(new Event('online')),
		);
		await expect(noAssets).toBeVisible();
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

	test('a later page keeps the way back while it waits and when it fails', async ({
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
		await giveKioskOwnerCaps(chain, multisig.address, 21);

		await alice.signIn();
		const { page } = alice;
		await openObjects(page);
		const rows = page.getByTestId('object-row');
		await expect(rows).toHaveCount(20);
		const next = page.getByTestId('objects-next-page');
		const back = page.getByTestId('objects-previous-page');

		// Offline a page waits, rather than saying it holds nothing.
		const dispatch = (event: 'offline' | 'online') =>
			page.evaluate(
				(name) => window.dispatchEvent(new Event(name)),
				event,
			);
		await dispatch('offline');
		await next.click();
		await expect(
			page.getByTestId('objects-table'),
		).toHaveAttribute('aria-busy', 'true');
		await expect(next).toBeDisabled();
		await back.click();
		await expect(rows).toHaveCount(20);
		await dispatch('online');

		const listing = '**/ListOwnedObjects';
		await page.route(listing, (route) => route.abort());
		await next.click();
		await expect(
			page.getByTestId('objects-error'),
		).toBeVisible();
		await expect(
			page.getByTestId('objects-page'),
		).toHaveAttribute('data-page', '2');
		await expect(next).toBeDisabled();

		await page.unroute(listing);
		await back.click();
		await expect(rows).toHaveCount(20);
	});

	test('the objects list starts over on a filter it returns to and on another pod', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const first = await setupMultisig({
			creator: alice,
			members: [createIdentity('bob')],
			threshold: 1,
		});
		const second = await setupMultisig({
			creator: alice,
			members: [createIdentity('carol')],
			threshold: 1,
		});
		await giveKioskOwnerCaps(chain, first.address, 21);
		await giveKioskOwnerCaps(chain, second.address, 21);

		await alice.signIn();
		const { page } = alice;
		await page.goto(
			`/multisig/${first.address}/assets?view=objects`,
		);
		await expect(
			page.getByTestId('object-row'),
		).toHaveCount(20);
		// The switcher lands on the tokens: open the second pod's objects,
		// so going back to the first keeps the same objects card.
		await page.getByTestId('multisig-switcher').click();
		await page
			.locator(
				`[data-testid="multisig-switcher-option"][data-address="${second.address}"]`,
			)
			.click();
		await page.getByTestId('assets-tab-objects').click();

		const pageNumber = page.getByTestId('objects-page');
		const next = page.getByTestId('objects-next-page');
		await next.click();
		await expect(pageNumber).toHaveAttribute(
			'data-page',
			'2',
		);

		// To another filter and back.
		const pickType = async (type: string) => {
			await page.getByTestId('objects-type-select').click();
			await page
				.locator(
					`[data-testid="objects-type-option"][data-value="${type}"]`,
				)
				.click();
		};
		await pickType('kioskOwnerCap');
		await expect(pageNumber).toHaveAttribute(
			'data-page',
			'1',
		);
		await pickType('all');
		await expect(pageNumber).toHaveAttribute(
			'data-page',
			'1',
		);

		// To the first pod, from the second's page 2.
		await next.click();
		await expect(pageNumber).toHaveAttribute(
			'data-page',
			'2',
		);
		await page.goBack();
		await expect(
			page.getByTestId('multisig-detail'),
		).toHaveAttribute(
			'data-multisig-address',
			first.address,
		);
		await expect(pageNumber).toHaveAttribute(
			'data-page',
			'1',
		);
		await expect(
			page.getByTestId('object-row'),
		).toHaveCount(20);
	});

	test('a coin type in the filter points to the tokens, without asking for it', async ({
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
		await giveKioskOwnerCaps(chain, multisig.address, 1);

		await alice.signIn();
		const { page } = alice;
		await openObjects(page);
		const rows = page.getByTestId('object-row');
		await expect(rows).toHaveCount(1);

		const coinListings: string[] = [];
		page.on('request', (request) => {
			if (
				asksFor(request, 'ListOwnedObjects', '::coin::Coin')
			)
				coinListings.push(request.url());
		});
		await page
			.getByTestId('objects-filter-input')
			.fill('0x2::coin::Coin<0x2::sui::SUI>');
		await expect(
			page.getByTestId('objects-filter-error'),
		).toHaveAttribute('data-reason', 'coin-type');
		await expect(rows).toHaveCount(1);
		expect(coinListings).toEqual([]);
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
		// The short package id shows the whole one on hover.
		await cap.getByTestId('object-subtitle-id').hover();
		await expect(
			page
				.getByTestId('address-popup')
				.filter({ hasText: packageId }),
		).toBeVisible();
		const subtitle = cap.getByTestId('object-subtitle');
		await expect(subtitle).toContainText('version 1');
		await expect(subtitle).toContainText('Compatible');
	});

	test('a tap on a package id shows the whole id, copy and link', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice', {
			hasTouch: true,
		});
		const { objectsUrl, packageId } =
			await signInWithUpgradeCap(
				alice,
				createIdentity('bob'),
				chain,
			);
		const { page } = alice;
		await callLocalnetTestnet(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(objectsUrl);

		await packageIdTrigger(page).tap();
		const popup = page.getByTestId('address-popup');
		await expect(popup).toContainText(packageId);
		await expect(
			popup.getByTestId('address-copy'),
		).toBeVisible();
		await expect(
			popup.getByTestId('address-explorer-link'),
		).toBeVisible();
	});

	test('the keyboard reaches the copy button of a package id', async ({
		createActor,
		createIdentity,
		chain,
	}) => {
		const alice = await createActor('alice');
		const { objectsUrl, packageId } =
			await signInWithUpgradeCap(
				alice,
				createIdentity('bob'),
				chain,
			);
		const { page } = alice;
		await page.goto(objectsUrl);

		const trigger = packageIdTrigger(page);
		await trigger.focus();
		await page.keyboard.press('Enter');
		const popup = page.getByTestId('address-popup');
		await expect(popup).toContainText(packageId);
		await expect(
			popup.getByTestId('address-copy'),
		).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(popup).toBeHidden();
		await expect(trigger).toBeFocused();
	});
});
