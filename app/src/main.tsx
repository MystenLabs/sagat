import React from 'react';
import ReactDOM from 'react-dom/client';

import '@mysten/dapp-kit/dist/index.css';
import './index.css';

import {
	SuiClientProvider,
	WalletProvider,
} from '@mysten/dapp-kit';
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
