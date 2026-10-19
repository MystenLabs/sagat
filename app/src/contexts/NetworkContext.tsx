// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';

import { LocalStorageKeys } from '@/lib/localStorageKeys';

export type SuiNetwork =
	'mainnet' | 'testnet' | 'devnet' | 'localnet';

export function useNetwork() {
	const dappKit = useDAppKit();
	const network = useCurrentNetwork();

	return {
		network: network as SuiNetwork,
		setNetwork: (network: SuiNetwork) => {
			dappKit.switchNetwork(network);
			localStorage.setItem(
				LocalStorageKeys.SuiNetwork,
				network,
			);
		},
		isTestMode: network !== 'mainnet',
	};
}
