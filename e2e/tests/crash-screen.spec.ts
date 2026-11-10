// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Page } from '@playwright/test';

import { E2E } from '../support/env';
import { expect, test } from '../support/fixtures';
import { setupMultisig } from '../support/scenarios';

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

type Member = { label: unknown };
type Account = { name: unknown; members: Member[] };

test.describe('crash screens', () => {
	test('a page that fails to render shows a crash screen inside the shell, and recovers', async ({
		createActor,
		createIdentity,
	}) => {
		const alice = await createActor('alice');
		const bob = createIdentity('bob');
		const multisig = await setupMultisig({
			creator: alice,
			members: [bob],
			threshold: 1,
		});
		const { page } = alice;
		await alice.signIn();

		// Only the signers tab renders this response's member labels.
		const detailsUrl = `${E2E.apiUrl}/multisig/${multisig.address}`;
		await corrupt<Account>(page, detailsUrl, (body) => ({
			...body,
			members: body.members.map((member) => ({
				...member,
				label: { broken: true },
			})),
		}));

		const crashed = page.getByTestId('page-crashed');
		await page.goto(
			`/multisig/${multisig.address}/signers`,
		);
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

		await page.getByTestId('multisig-tab-signers').click();
		await expect(crashed).toBeVisible();

		// Once the data is good again, retrying renders the page.
		await page.unroute(detailsUrl);
		await page.getByTestId('page-crashed-retry').click();
		await expect(
			page.getByTestId('signers-card'),
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

		// The sidebar's account switcher renders these names.
		const connectionsUrl = `${E2E.apiUrl}/addresses/connections`;
		await corrupt<Record<string, Account[]>>(
			page,
			connectionsUrl,
			(body) =>
				Object.fromEntries(
					Object.entries(body).map(([key, accounts]) => [
						key,
						accounts.map((account) => ({
							...account,
							name: { broken: true },
						})),
					]),
				),
		);

		const crashed = page.getByTestId('app-crashed');
		await page.reload();
		await expect(crashed).toBeVisible();

		await page.unroute(connectionsUrl);
		await page.getByTestId('app-crashed-reload').click();
		await expect(
			page.getByTestId('multisig-switcher'),
		).toBeVisible();
		await expect(crashed).toBeHidden();
	});
});
