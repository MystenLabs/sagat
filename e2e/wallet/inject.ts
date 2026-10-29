// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Bundled into an IIFE by global-setup.ts and injected into every page with
// `context.addInitScript`, before any app code runs.
//
// It registers a dev wallet holding keys the test controls, and auto-approves
// every connect and signing request, unless the test asks otherwise:
// `declineConnect` and `declineSign` have it decline connects and
// personal-message signatures, `rejectSigning` has it decline every
// transaction to sign, the way a user declines (not a wallet failing), and
// `failRestore` has its silent session restore throw.
//
// Registration goes through the wallet-standard window events rather than
// `wallet.register()`: this bundle has its own copy of the wallet registry,
// so only the event protocol reaches the app's registry (the same way
// browser-extension wallets register).
import { DevWallet } from '@mysten-incubation/dev-wallet';
import { InMemorySignerAdapter } from '@mysten-incubation/dev-wallet/adapters';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64, toBase64 } from '@mysten/sui/utils';

import type { E2EWalletConfig } from './types';

declare global {
	interface Window {
		__E2E_WALLET_CONFIG__?: E2EWalletConfig;
		__e2eWallet?: E2EWallet;
	}
}

type SignTransaction =
	DevWallet['features']['sui:signTransaction']['signTransaction'];
type SignAndExecute =
	DevWallet['features']['sui:signAndExecuteTransaction']['signAndExecuteTransaction'];
type Connect =
	DevWallet['features']['standard:connect']['connect'];
type SignPersonalMessage =
	DevWallet['features']['sui:signPersonalMessage']['signPersonalMessage'];

// A transaction that executes but fails on chain comes back from real
// wallets with its effects, which say it failed; the dev wallet throws
// instead. Sign with the dev wallet and execute here, like a real wallet.
class E2EWallet extends DevWallet {
	// See `E2EWalletConfig.failRestore`.
	failRestore = false;
	// `declineConnect` rejects a connect from the app (the silent restore
	// still works); see `E2EWalletConfig.declineSign` and
	// `E2EWalletConfig.rejectSigning`. Read on every request, so a test can
	// flip them on `window.__e2eWallet`.
	declineConnect = false;
	declineSign = false;
	rejectSigning = false;

	get features() {
		const features = super.features;
		const { connect } = features['standard:connect'];
		const restoreOrConnect: Connect = (input) => {
			if (this.failRestore && input?.silent)
				return Promise.reject(new Error('restore failed'));
			if (this.declineConnect && !input?.silent)
				return Promise.reject(
					new Error('Connection rejected by user.'),
				);
			return connect(input);
		};
		const { signPersonalMessage } =
			features['sui:signPersonalMessage'];
		const signOrDecline: SignPersonalMessage = (input) =>
			this.declineSign
				? Promise.reject(
						new Error('Request rejected by user.'),
					)
				: signPersonalMessage(input);
		const signTransaction: SignTransaction = (input) =>
			this.rejectSigning
				? // The dev wallet's own words when its user rejects.
					Promise.reject(
						new Error('Request rejected by user.'),
					)
				: features['sui:signTransaction'].signTransaction(
						input,
					);
		const signAndExecuteTransaction: SignAndExecute =
			async (input) => {
				const { bytes, signature } =
					await signTransaction(input);
				const network = input.chain.replace(/^sui:/, '');
				const result = await this.getClient(
					network,
				).core.executeTransaction({
					transaction: fromBase64(bytes),
					signatures: [signature],
					include: { effects: true },
				});
				const { digest, effects } =
					result.Transaction ?? result.FailedTransaction;
				return {
					bytes,
					signature,
					digest,
					effects: toBase64(effects.bcs!),
				};
			};
		return {
			...features,
			'standard:connect': {
				version: '1.0.0' as const,
				connect: restoreOrConnect,
			},
			'sui:signPersonalMessage': {
				...features['sui:signPersonalMessage'],
				signPersonalMessage: signOrDecline,
			},
			'sui:signTransaction': {
				...features['sui:signTransaction'],
				signTransaction,
			},
			'sui:signAndExecuteTransaction': {
				version: '2.0.0' as const,
				signAndExecuteTransaction,
			},
		};
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

	const wallet = new E2EWallet({
		name: config.name,
		adapters: [adapter],
		networks: { localnet: config.rpcUrl },
		activeNetwork: 'localnet',
		autoApprove: true,
		autoConnect: true,
	});
	// The dev wallet always advertises every standard chain, so a narrower
	// list replaces its getter.
	const { chains } = config;
	if (chains) {
		Object.defineProperty(wallet, 'chains', {
			get: () => chains,
		});
	}
	wallet.failRestore = !!config.failRestore;
	wallet.declineSign = !!config.declineSign;
	wallet.rejectSigning = !!config.rejectSigning;
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
