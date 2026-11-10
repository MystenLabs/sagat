// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Keep first: error reporting starts before the other modules load.
import './instrument.ts';

import React from 'react';
import ReactDOM from 'react-dom/client';

import './index.css';

import {
	createDAppKit,
	DAppKitProvider,
} from '@mysten/dapp-kit-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';

import App from './App.tsx';
import { AppCrashed } from './components/CrashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from './components/ui/sonner';
import { ApiAuthProvider } from './contexts/ApiAuthContext.tsx';
import { CONFIG } from './lib/constants.ts';
import { reportCrash } from './lib/error-reporting.ts';
import { LocalStorageKeys } from './lib/localStorageKeys.ts';
import { createQueryClient } from './lib/query-client.ts';
import { newClient } from './lib/sui-client.ts';

const storedNetwork =
	(localStorage.getItem(LocalStorageKeys.SuiNetwork) as
		'testnet' | 'mainnet' | 'devnet' | 'localnet') ||
	// With the dev wallet on, start on localnet until a network is chosen.
	(import.meta.env.VITE_DEV_WALLET === '1' &&
	import.meta.env.VITE_LOCALNET_RPC_URL
		? 'localnet'
		: CONFIG.DEFAULT_NETWORK);

export const dAppKit = createDAppKit({
	networks: ['testnet', 'mainnet', 'devnet', 'localnet'],
	createClient: (network) => newClient(network),
	defaultNetwork: storedNetwork,
	storageKey: LocalStorageKeys.WalletSession,
	// A saved session that no longer resolves holds the layout until this
	// runs out; extension wallets register well within it.
	autoConnectTimeout: 2000,
});

// Register types for hook type inference
declare module '@mysten/dapp-kit-react' {
	interface Register {
		dAppKit: typeof dAppKit;
	}
}

const queryClient = createQueryClient();

// Local-only: the flag is inlined at build time, so without it the dev
// wallet is not in the bundle at all.
if (import.meta.env.VITE_DEV_WALLET === '1') {
	import('./dev-wallet')
		.then(({ registerDevWallet }) => registerDevWallet())
		.catch((error) => {
			// eslint-disable-next-line no-console
			console.error('Dev wallet failed to register', error);
		});
}

ReactDOM.createRoot(
	document.getElementById('root')!,
).render(
	<React.StrictMode>
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
		>
			<ErrorBoundary
				fallback={() => <AppCrashed />}
				onError={(error, info) =>
					reportCrash(error, info, 'app')
				}
			>
				<QueryClientProvider client={queryClient}>
					<DAppKitProvider dAppKit={dAppKit}>
						<ApiAuthProvider>
							<App />
						</ApiAuthProvider>
					</DAppKitProvider>
				</QueryClientProvider>
			</ErrorBoundary>

			<Toaster />
		</ThemeProvider>
	</React.StrictMode>,
);
