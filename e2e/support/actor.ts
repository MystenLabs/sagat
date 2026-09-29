// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
	expect,
	type Browser,
	type BrowserContext,
	type Page,
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

// A test user with their own browser context (own cookies, own wallet).
// Every person in a multi-party flow needs one: the API accepts invitations
// automatically for every key signed in within the same browser.
export class Actor extends Identity {
	private constructor(
		name: string,
		keypair: Ed25519Keypair,
		readonly context: BrowserContext,
		readonly page: Page,
	) {
		super(name, keypair);
	}

	static async create(
		browser: Browser,
		name: string,
		keypair: Ed25519Keypair,
	) {
		const context = await browser.newContext();
		await isolateFromInternet(context);

		const walletConfig: E2EWalletConfig = {
			name: E2E.walletName,
			rpcUrl: E2E.rpcUrl,
			accounts: [
				{ label: name, secretKey: keypair.getSecretKey() },
			],
		};
		await context.addInitScript((config) => {
			localStorage.setItem('SuiNetwork', 'localnet');
			window.__E2E_WALLET_CONFIG__ = config;
		}, walletConfig);
		await context.addInitScript({
			path: PATHS.walletBundle,
		});

		return new Actor(
			name,
			keypair,
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

	// Connects the test wallet from the header's wallet menu.
	async connectWallet() {
		await this.page
			.getByTestId('app-header')
			.getByTestId('connect-wallet-button')
			.filter({ visible: true })
			.click();
		await this.page
			.locator(
				`[data-testid="wallet-option"][data-wallet-name="${E2E.walletName}"]`,
			)
			.click();
		await expect(this.walletMenuButton()).toBeVisible();
	}

	// Connects the wallet and signs the auth message, like a user would.
	async signIn() {
		await this.page.goto('/');
		await this.connectWallet();
		await this.page.getByTestId('sign-in-button').click();
		await expect(this.walletMenuButton()).toHaveAttribute(
			'data-auth-state',
			'authenticated',
		);
	}

	proposalCard(digest: string) {
		return this.page.locator(
			`[data-testid="proposal-card"][data-digest="${digest}"]`,
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
				return route.fulfill({
					json: { coins: [] },
					headers: { 'access-control-allow-origin': '*' },
				});
			return route.abort('blockedbyclient');
		},
	);
}
