// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Page } from '@playwright/test';

import {
	addSigners,
	nameMultisig,
} from '../support/create-wizard';
import { E2E } from '../support/env';
import { expect, test } from '../support/fixtures';
import {
	setupMultisig,
	signInViaApi,
} from '../support/scenarios';

// Rewrites a real API response into data the app can't render.
async function corrupt<T>(
	page: Page,
	url: string,
	rewrite: (body: T) => unknown,
) {
	await page.route(url, async (route) => {
		const response = await route.fetch();
		await route.fulfill({
			response,
			json: rewrite(await response.json()),
		});
	});
}

test.describe('crash screens', () => {
	test('a page that fails to render shows a crash screen inside the shell, and recovers', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		// So the API can look up Bob's key from his address.
		await signInViaApi(bob);
		const { page } = alice;
		await alice.signIn();

		// The wizard puts the looked-up key in the signer's row.
		const addressUrl = `${E2E.apiUrl}/addresses/*`;
		await corrupt<object>(page, addressUrl, (body) => ({
			...body,
			publicKey: { broken: true },
		}));
		const addBob = async () => {
			await page.goto('/create');
			await nameMultisig(page, 'Treasury');
			await addSigners(page, [{ key: bob.address }]);
		};

		const crashed = page.getByTestId('page-crashed');
		await addBob();
		await expect(crashed).toBeVisible();
		await expect(
			page.getByTestId('nav-invitations'),
		).toBeVisible();

		// Leaving for another page clears the crash.
		await page.getByTestId('nav-invitations').click();
		await expect(
			page.getByTestId('invitations-page'),
		).toBeVisible();
		await expect(crashed).toBeHidden();

		await addBob();
		await expect(crashed).toBeVisible();

		// Once the data is good again, retrying renders the page.
		await page.unroute(addressUrl);
		await page.getByTestId('page-crashed-retry').click();
		await expect(
			page.getByTestId('create-name-input'),
		).toBeVisible();
		await expect(crashed).toBeHidden();
	});

	test('a shell that fails to render shows the app crash screen, and a reload recovers', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 1,
		});
		const { page } = alice;
		await alice.signIn();

		// The shell reads the session's addresses from this response.
		const authUrl = `${E2E.apiUrl}/auth/check`;
		await corrupt<object>(page, authUrl, (body) => ({
			...body,
			addresses: { broken: true },
		}));

		const crashed = page.getByTestId('app-crashed');
		await page.reload();
		await expect(crashed).toBeVisible();

		await page.unroute(authUrl);
		await page.getByTestId('app-crashed-reload').click();
		await expect(
			page.getByTestId('multisig-switcher'),
		).toBeVisible();
		await expect(crashed).toBeHidden();
	});
});
