// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useSuiClientContext } from '@mysten/dapp-kit';

export type SuiNetwork = 'testnet' | 'mainnet';

export function useNetwork() {
	const clientCtx = useSuiClientContext();

	return {
		network: clientCtx.network as SuiNetwork,
		setNetwork: (network: SuiNetwork) => {
			clientCtx.selectNetwork(network);
			localStorage.setItem('suiNetwork', network);
		},
		isTestMode: clientCtx.network === 'testnet',
	};
}
