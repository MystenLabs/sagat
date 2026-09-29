// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Bundled into an IIFE by global-setup.ts and injected into every page with
// `context.addInitScript`, before any app code runs.
//
// It registers a dev wallet holding keys the test controls, and auto-approves
// every connect and signing request. Registration goes through the
// wallet-standard window events rather than `wallet.register()`: this bundle
// has its own copy of the wallet registry, so only the event protocol reaches
// the app's registry (the same way browser-extension wallets register).
import { DevWallet } from '@mysten-incubation/dev-wallet';
import { InMemorySignerAdapter } from '@mysten-incubation/dev-wallet/adapters';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

import type { E2EWalletConfig } from './types';

declare global {
	interface Window {
		__E2E_WALLET_CONFIG__?: E2EWalletConfig;
		__e2eWallet?: DevWallet;
	}
}

// The `register` callback the app's wallet registry hands out.
type RegisterApi = {
	register: (wallet: DevWallet) => unknown;
};

async function registerE2EWallet(config: E2EWalletConfig) {
	const adapter = new InMemorySignerAdapter();
	for (const { label, secretKey } of config.accounts) {
		const { secretKey: bytes } =
			decodeSuiPrivateKey(secretKey);
		await adapter.importAccount({
			signer: Ed25519Keypair.fromSecretKey(bytes),
			label,
		});
	}

	const wallet = new DevWallet({
		name: config.name,
		adapters: [adapter],
		networks: { localnet: config.rpcUrl },
		activeNetwork: 'localnet',
		autoApprove: true,
		autoConnect: true,
	});
	window.__e2eWallet = wallet;

	const register = ({ register }: RegisterApi) =>
		register(wallet);
	window.dispatchEvent(
		new CustomEvent('wallet-standard:register-wallet', {
			detail: register,
		}),
	);
	window.addEventListener('wallet-standard:app-ready', ((
		event: CustomEvent<RegisterApi>,
	) => register(event.detail)) as EventListener);
}

const config = window.__E2E_WALLET_CONFIG__;
if (config && !window.__e2eWallet) {
	registerE2EWallet(config).catch((error) => {
		// Surface setup problems in the test's console output.
		// eslint-disable-next-line no-console
		console.error('E2E wallet failed to register', error);
	});
}
