// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
	expect,
	type Browser,
	type BrowserContext,
	type Page,
	type Route,
} from '@playwright/test';

import type { E2EWalletConfig } from '../wallet/types';
import { E2E } from './env';
import { Identity } from './identity';
import { PATHS } from './paths';

const LOCAL_HOSTS = new Set([
	'localhost',
	'127.0.0.1',
	'[::1]',
]);
const RECOGNIZED_COINS_URL =
	'https://apps-backend.sui.io/v2/recognized-coins';

// An entry of the price list, as the endpoint returns it.
export interface RecognizedCoin {
	coinType: string;
	symbol: string;
	name: string;
	decimals: number;
	priceUsd: number | null;
}

// A test user with their own browser context (own cookies, own wallet).
// Every person in a multi-party flow needs one: the API accepts invitations
// automatically for every key signed in within the same browser.
//
// The actor is the wallet's first account. `otherAccounts` are further
// accounts in the same wallet, e.g. to test switching between them.
export class Actor extends Identity {
	private constructor(
		name: string,
		keypair: Ed25519Keypair,
		readonly otherAccounts: Identity[],
		readonly context: BrowserContext,
		readonly page: Page,
	) {
		super(name, keypair);
	}

	static async create(
		browser: Browser,
		name: string,
		keypair: Ed25519Keypair,
		otherAccounts: Identity[] = [],
		wallet: Pick<
			E2EWalletConfig,
			'chains' | 'failRestore' | 'declineSign'
		> = {},
	) {
		const context = await browser.newContext();
		await isolateFromInternet(context);

		const walletConfig: E2EWalletConfig = {
			name: E2E.walletName,
			rpcUrl: E2E.rpcUrl,
			accounts: [
				{ label: name, secretKey: keypair.getSecretKey() },
				...otherAccounts.map((account) => ({
					label: account.name,
					secretKey: account.keypair.getSecretKey(),
				})),
			],
			...wallet,
		};
		await context.addInitScript((config) => {
			// Start on localnet, but keep a network the app saved, so a
			// reload lands where the user left off.
			if (!localStorage.getItem('SuiNetwork'))
				localStorage.setItem('SuiNetwork', 'localnet');
			window.__E2E_WALLET_CONFIG__ = config;
		}, walletConfig);
		await context.addInitScript({
			path: PATHS.walletBundle,
		});

		return new Actor(
			name,
			keypair,
			otherAccounts,
			context,
			await context.newPage(),
		);
	}

	// The header renders separate desktop and mobile menus and hides one with
	// CSS, so always pick the visible one.
	walletMenuButton() {
		return this.page
			.getByTestId('app-header')
			.getByTestId('wallet-menu-button')
			.filter({ visible: true });
	}

	// Connects the test wallet from the header's wallet menu. On pages
	// that need an API session connecting also signs in, so wait for that:
	// a later wallet request would otherwise race the sign-in signature.
	// Pass `signIn: false` on pages that only connect (tools, proposal
	// links).
	async connectWallet({ signIn = true } = {}) {
		await this.page
			.getByTestId('app-header')
			.getByTestId('connect-wallet-button')
			.filter({ visible: true })
			.click();
		await this.walletOption().click();
		await expect(this.walletMenuButton()).toHaveAttribute(
			'data-auth-state',
			signIn ? 'authenticated' : 'unauthenticated',
		);
	}

	// Opens the wallet menu unless it is open already: a second trigger
	// click would close it. Base UI keeps a closing popup in the DOM for
	// its exit animation, so wait for the open one.
	async openWalletMenu() {
		const trigger = this.walletMenuButton();
		if (
			(await trigger.getAttribute('aria-expanded')) !==
			'true'
		)
			await trigger.click();
		await expect(
			this.page
				.locator(
					'[data-slot="dropdown-menu-content"][data-open]',
				)
				.last(),
		).toBeVisible();
	}

	// Closes the wallet menu with Escape, which can't reopen it the way a
	// trigger click can while it is still animating out. Base UI under a
	// fake clock or on a slow CI runner can miss the first Escape, so press
	// it again while the menu stays open, then fall back to a press outside
	// the menu, on the page content clear of the sidebar.
	async closeWalletMenu() {
		const trigger = this.walletMenuButton();
		await this.page.keyboard.press('Escape');
		for (let attempt = 0; attempt < 3; attempt++) {
			await this.page.waitForTimeout(300);
			if (
				(await trigger.getAttribute('aria-expanded')) !==
				'true'
			)
				break;
			await this.page.keyboard.press('Escape');
		}
		if (
			(await trigger.getAttribute('aria-expanded')) ===
			'true'
		)
			await this.page.mouse.click(900, 600);
		await expect(trigger).toHaveAttribute(
			'aria-expanded',
			'false',
		);
	}

	// The test wallet's entry in an open wallet picker.
	walletOption() {
		return this.page.locator(
			`[data-testid="wallet-option"][data-wallet-name="${E2E.walletName}"]`,
		);
	}

	// The connect prompt's line saying the wallet declined a request.
	declinedLine() {
		return this.page.getByTestId('connect-declined');
	}

	toast(text: string) {
		return this.page
			.locator('[data-sonner-toast]')
			.filter({ hasText: text });
	}

	// Signs in `account` from the wallet menu's account list, switching to it
	// first when it isn't the current one.
	async signInAccount(account: Identity) {
		await this.openWalletMenu();
		await this.walletAccount(account.address)
			.getByTestId('wallet-account-sign')
			.click();
		await expect(this.walletMenuButton()).toHaveAttribute(
			'data-address',
			account.address,
		);
		await expect(this.walletMenuButton()).toHaveAttribute(
			'data-auth-state',
			'authenticated',
		);
	}

	// Makes `account` the current wallet account, without signing.
	async switchAccount(account: Identity) {
		await this.openWalletMenu();
		await this.walletAccount(account.address)
			.getByTestId('wallet-account-switch')
			.click();
		await expect(this.walletMenuButton()).toHaveAttribute(
			'data-address',
			account.address,
		);
	}

	walletAccount(address: string) {
		return this.page
			.locator(
				`[data-testid="wallet-account"][data-address="${address}"]`,
			)
			.filter({ visible: true });
	}

	// Connects the wallet, which signs the auth message, like a user would.
	async signIn() {
		await this.page.goto('/');
		await this.connectWallet();
	}

	// Answers the price list with `coins` instead of an empty one. Call it
	// before the page loads, as the app reads the list once.
	async stubRecognizedCoins(coins: RecognizedCoin[]) {
		await this.page.route(RECOGNIZED_COINS_URL, (route) =>
			fulfillRecognizedCoins(route, coins),
		);
	}

	proposalCard(digest: string) {
		return this.page.locator(
			`[data-testid="proposal-card"][data-digest="${digest}"]`,
		);
	}

	openProposal(digest: string) {
		return this.page.locator(
			`[data-testid="open-proposal"][data-digest="${digest}"]`,
		);
	}

	invitationCard(multisigAddress: string) {
		return this.page.locator(
			`[data-testid="invitation-card"][data-multisig-address="${multisigAddress}"]`,
		);
	}

	memberItem(address: string) {
		return this.page.locator(
			`[data-testid="member-item"][data-address="${address}"]`,
		);
	}

	suiBalanceRow() {
		return this.page.locator(
			'[data-testid="asset-row"][data-coin-type$="::sui::SUI"]',
		);
	}
}

// Only the local stack is reachable. Outside services (Slush, WalletConnect,
// public RPCs) are blocked, so tests can't depend on them or flake on them.
async function isolateFromInternet(
	context: BrowserContext,
) {
	await context.route(
		(url) => !LOCAL_HOSTS.has(url.hostname),
		(route) => {
			// The app waits for this mainnet price list before it reads coin
			// metadata from the chain, so answer it instead of failing it.
			if (
				route
					.request()
					.url()
					.startsWith(RECOGNIZED_COINS_URL)
			)
				return fulfillRecognizedCoins(route, []);
			return route.abort('blockedbyclient');
		},
	);
}

function fulfillRecognizedCoins(
	route: Route,
	coins: RecognizedCoin[],
) {
	return route.fulfill({
		json: { coins },
		headers: { 'access-control-allow-origin': '*' },
	});
}
