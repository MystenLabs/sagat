// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { registerWalletConnectWallet } from '@mysten/walletconnect-wallet';
import React from 'react';
import ReactDOM from 'react-dom/client';

import '@mysten/dapp-kit/dist/index.css';
import './index.css';

import {
	SuiClientProvider,
	WalletProvider,
} from '@mysten/dapp-kit';
import {
	getFullnodeUrl,
	SuiClient,
} from '@mysten/sui/client';
import {
	QueryClient,
	QueryClientProvider,
} from '@tanstack/react-query';
import { Toaster } from 'sonner';

import App from './App.tsx';
import { ApiAuthProvider } from './contexts/ApiAuthContext.tsx';
import { CONFIG } from './lib/constants';
import { networkConfig } from './networkConfig.ts';

const queryClient = new QueryClient();

// Get stored network or default to configured default
const storedNetwork =
	(localStorage.getItem('suiNetwork') as
		| 'testnet'
		| 'mainnet') || CONFIG.DEFAULT_NETWORK;

registerWalletConnectWallet({
	projectId: '26cfd1ea871281c3665d0dad8b8cebd7',
	getClient: (chain) => {
		return new SuiClient({
			network: chain,
			url: getFullnodeUrl(chain),
		});
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
		<QueryClientProvider client={queryClient}>
			<SuiClientProvider
				networks={networkConfig}
				defaultNetwork={storedNetwork}
			>
				<WalletProvider autoConnect>
					<ApiAuthProvider>
						<App />
					</ApiAuthProvider>
				</WalletProvider>
			</SuiClientProvider>
		</QueryClientProvider>

		<Toaster />
	</React.StrictMode>,
);
