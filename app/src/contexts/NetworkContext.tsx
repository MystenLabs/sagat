// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';

export type SuiNetwork = 'testnet' | 'mainnet' | 'devnet';

export function useNetwork() {
	const dappKit = useDAppKit();
	const network = useCurrentNetwork();

	return {
		network: network as SuiNetwork,
		setNetwork: (network: SuiNetwork) => {
			dappKit.switchNetwork(network);
			localStorage.setItem('suiNetwork', network);
		},
		isTestMode:
			network === 'testnet' ||
			network === 'devnet',
	};
}
