// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// A local-only wallet for trying the app on localnet. Loaded from
// main.tsx only when VITE_DEV_WALLET is set, so production bundles never
// include it. It holds the demo identities the seed script funds and asks
// for approval like a real wallet.
import {
	DEFAULT_NETWORK_URLS,
	mountAndRegisterDevWallet,
} from '@mysten-incubation/dev-wallet';
import { InMemorySignerAdapter } from '@mysten-incubation/dev-wallet/adapters';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// Same derivation as the seed script, so the addresses match the ones it
// funded.
const PEOPLE = [
	['maya', 'Maya'],
	['daniel', 'Daniel'],
	['tomas', 'Tomás'],
	['hana', 'Hana'],
	['payments', 'Payments service'],
] as const;

async function demoKeypair(name: string) {
	const seed = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(`sagat-demo:${name}`),
	);
	return Ed25519Keypair.fromSecretKey(new Uint8Array(seed));
}

export async function registerDevWallet() {
	const adapter = new InMemorySignerAdapter();

	const secretKey = import.meta.env
		.VITE_DEV_WALLET_SECRET_KEY;
	if (secretKey) {
		const { secretKey: bytes } =
			decodeSuiPrivateKey(secretKey);
		await adapter.importAccount({
			signer: Ed25519Keypair.fromSecretKey(bytes),
			label: 'You (demo)',
		});
	} else {
		// eslint-disable-next-line no-console
		console.warn(
			'VITE_DEV_WALLET_SECRET_KEY is not set; the dev wallet has no "You (demo)" account.',
		);
	}

	for (const [name, label] of PEOPLE) {
		await adapter.importAccount({
			signer: await demoKeypair(name),
			label,
		});
	}

	return mountAndRegisterDevWallet({
		name: 'Dev Wallet',
		adapters: [adapter],
		createInitialAccount: false,
		networks: {
			...DEFAULT_NETWORK_URLS,
			localnet:
				import.meta.env.VITE_LOCALNET_RPC_URL ||
				DEFAULT_NETWORK_URLS.localnet,
		},
		activeNetwork: 'localnet',
		autoApprove: false,
		autoConnect: false,
		mountUI: true,
	});
}
