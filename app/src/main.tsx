// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { registerWalletConnectWallet } from '@mysten/walletconnect-wallet';
import React from 'react';
import ReactDOM from 'react-dom/client';

import './index.css';

import {
	createDAppKit,
	DAppKitProvider,
} from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import {
	QueryClient,
	QueryClientProvider,
} from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';

import App from './App.tsx';
import { Toaster } from './components/ui/sonner';
import { ApiAuthProvider } from './contexts/ApiAuthContext.tsx';
import { CONFIG } from './lib/constants.ts';
import { LocalStorageKeys } from './lib/localStorageKeys.ts';

const storedNetwork =
	(localStorage.getItem(LocalStorageKeys.SuiNetwork) as
		| 'testnet'
		| 'mainnet'
		| 'devnet'
		| 'localnet') || CONFIG.DEFAULT_NETWORK;

export const dAppKit = createDAppKit({
	networks: ['testnet', 'mainnet', 'devnet', 'localnet'],
	createClient: (network) => newClient(network),
	defaultNetwork: storedNetwork,
});

// Register types for hook type inference
declare module '@mysten/dapp-kit-react' {
	interface Register {
		dAppKit: typeof dAppKit;
	}
}

const queryClient = new QueryClient();

// Get stored network or default to configured default
const newClient = (
	network: 'testnet' | 'mainnet' | 'devnet' | 'localnet',
) => {
	return new SuiGrpcClient({
		network,
		baseUrl: getJsonRpcFullnodeUrl(network),
	});
};

registerWalletConnectWallet({
	projectId: '26cfd1ea871281c3665d0dad8b8cebd7',
	getClient: (chain) => {
		return newClient(chain);
	},
	metadata: {
		walletName: 'Wallet Connect',
		icon: 'https://walletconnect.org/walletconnect-logo.png',
		enabled: true,
		id: 'walletconnect',
	},
});

ReactDOM.createRoot(
	document.getElementById('root')!,
).render(
	<React.StrictMode>
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
		>
			<QueryClientProvider client={queryClient}>
				<DAppKitProvider dAppKit={dAppKit}>
					<ApiAuthProvider>
						<App />
					</ApiAuthProvider>
				</DAppKitProvider>
			</QueryClientProvider>

			<Toaster />
		</ThemeProvider>
	</React.StrictMode>,
);
