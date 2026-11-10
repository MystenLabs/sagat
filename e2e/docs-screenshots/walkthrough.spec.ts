// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MIST_PER_SUI } from '@mysten/sui/utils';
import { expect, test, type Page } from '@playwright/test';

import {
	Actor,
	serveFullnodeLocally,
} from '../support/actor';
import { Chain, SUI_TYPE } from '../support/chain';
import {
	addSigners,
	nameMultisig,
	setThreshold,
} from '../support/create-wizard';
import { Identity } from '../support/identity';
import {
	chooseType,
	expectSimulation,
	fillTransfer,
	reviewTransfer,
} from '../support/new-proposal';
import {
	acceptInvitation,
	multisigAddressOf,
	proposeTransfer,
	setupMultisig,
	signInViaApi,
} from '../support/scenarios';

const OUT_DIR = fileURLToPath(
	new URL(
		'../../docs/public/screenshots/',
		import.meta.url,
	),
);

// The same keys as the app's dev wallet: sha256("sagat-demo:<name>").
function demoKeypair(name: string) {
	return Ed25519Keypair.fromSecretKey(
		createHash('sha256')
			.update(`sagat-demo:${name}`)
			.digest(),
	);
}

function person(name: string, label: string) {
	return new Identity(label, demoKeypair(name));
}

// Waits for fonts, parks the pointer and focus, and hides toasts.
async function shoot(page: Page, name: string) {
	await page.evaluate(async () => {
		await document.fonts.ready;
		(document.activeElement as HTMLElement | null)?.blur();
	});
	await page.mouse.move(0, 0);
	await page.screenshot({
		path: `${OUT_DIR}${name}.png`,
		animations: 'disabled',
		caret: 'hide',
		style:
			'[data-sonner-toaster] { display: none !important; }',
	});
}

test('getting started', async ({ browser }) => {
	const chain = new Chain();
	const maya = person('maya', 'Maya');
	const daniel = person('daniel', 'Daniel');
	const tomas = person('tomas', 'Tomás');
	const hana = person('hana', 'Hana');
	for (const someone of [maya, daniel, tomas, hana])
		await signInViaApi(someone);

	const you = await Actor.create(
		browser,
		'Alex',
		demoKeypair('you'),
		[],
		{
			network: 'mainnet',
			walletName: 'Demo Wallet',
		},
	);
	await serveFullnodeLocally(you.context, 'mainnet');
	await you.context.addInitScript(() =>
		localStorage.setItem('theme', 'light'),
	);
	const { page } = you;

	await test.step('connect a wallet', async () => {
		await page.goto('/');
		await expect(
			page.getByTestId('connect-wallet-prompt'),
		).toBeVisible();
	});

	await test.step('sign in', async () => {
		await page
			.getByTestId('app-header')
			.getByTestId('connect-wallet-button')
			.filter({ visible: true })
			.click();
		await you.walletOption().click();
		const signIn = page.getByTestId('sign-in-button');
		await expect(signIn).toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await shoot(page, 'sign-in');
		await signIn.click();
		await expect(you.walletMenuButton()).toHaveAttribute(
			'data-auth-state',
			'authenticated',
		);
	});

	const treasuryMembers = [
		{ identity: you },
		{ identity: maya },
		{ identity: daniel },
	];
	const treasury = multisigAddressOf(treasuryMembers, 2);

	await test.step('create an account', async () => {
		await page.getByTestId('create-first-multisig').click();
		await nameMultisig(page, 'Team Treasury');
		await addSigners(page, [
			{ label: 'Maya', key: maya.address },
			{ label: 'Daniel', key: daniel.address },
		]);
		await setThreshold(page, 2);
		await expect(
			page.getByTestId('create-preview-address'),
		).toHaveText(treasury);
		// Scroll just enough to show the threshold field whole.
		await page
			.getByTestId('create-threshold')
			.evaluate((input) => {
				input.style.scrollMarginBottom = '32px';
				input.scrollIntoView({ block: 'end' });
			});
		await shoot(page, 'create-signers');

		await page.getByTestId('create-continue').click();
		await expect(
			page.getByTestId('create-review-address'),
		).toHaveText(treasury);

		await page.getByTestId('create-submit').click();
		await expect(
			page.getByTestId('created-banner'),
		).toBeVisible();
		await page.getByTestId('multisig-tab-signers').click();
		await expect(
			you.memberItem(maya.address),
		).toHaveAttribute('data-status', 'pending');
		await shoot(page, 'account-created');
	});

	await test.step('an invitation', async () => {
		const grants = await setupMultisig({
			creator: maya,
			members: [daniel, you],
			threshold: 2,
			name: 'Grants Committee',
			labels: ['Maya', 'Daniel', null],
			accept: false,
		});
		await acceptInvitation(daniel, grants.address);

		await page.getByTestId('nav-invitations').click();
		const card = you.invitationCard(grants.address);
		await expect(card).toBeVisible();

		await card
			.getByTestId('invitation-toggle-details')
			.click();
		await expect(
			page.getByTestId('invitation-review'),
		).toBeVisible();
		await shoot(page, 'invitation-review');
		await page.keyboard.press('Escape');
		await expect(
			page.getByTestId('invitation-review'),
		).toHaveCount(0);
	});

	await test.step('propose a transfer', async () => {
		await acceptInvitation(maya, treasury);
		await acceptInvitation(daniel, treasury);
		// One coin, so the preview shows a plain gas fee, not a merge rebate.
		await chain.fundWithCoins(treasury, {
			count: 1,
			amount: 500n * MIST_PER_SUI,
		});

		await page.goto(`/multisig/${treasury}`);
		await page.getByTestId('new-proposal-button').click();
		await expect(
			page.getByTestId('type-step'),
		).toBeVisible();
		await shoot(page, 'new-proposal-type');

		await chooseType(page, 'transfer');
		await fillTransfer(page, {
			coinType: SUI_TYPE,
			amount: '25',
			recipient: hana.address,
		});
		await reviewTransfer(page);
		await expectSimulation(page, 'success');
		await shoot(page, 'new-proposal-review');
	});

	await test.step('sign and execute', async () => {
		const proposal = await proposeTransfer(chain, maya, {
			multisigAddress: treasury,
			recipient: tomas.address,
			amount: 40n * MIST_PER_SUI,
			description: 'Pay the design retainer',
			network: 'mainnet',
		});
		await page.goto(
			`/multisig/${treasury}/proposals/${proposal.digest}`,
		);
		const proposalPage = you.proposalPage(proposal.digest);
		await expect(proposalPage).toHaveAttribute(
			'data-status',
			'pending',
		);
		await expectSimulation(page, 'success');
		await expect(
			page.getByTestId('execute-after-signing'),
		).toBeChecked();
		await shoot(page, 'proposal-sign');

		await page.getByTestId('sign-proposal-button').click();
		await expect(proposalPage).toHaveAttribute(
			'data-status',
			'executed',
		);
		await shoot(page, 'proposal-executed');
	});

	await you.context.close();
});
