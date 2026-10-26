// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentNetwork,
	useDAppKit,
	useWalletConnection,
} from '@mysten/dapp-kit-react';

import { LocalStorageKeys } from '@/lib/localStorageKeys';
import { type SuiNetwork } from '@/lib/network';
import { toast } from '@/lib/toast';

export type { SuiNetwork } from '@/lib/network';

/**
 * Whether the wallet advertises the network. dapp-kit drops the account
 * when the current network is one the wallet does not list.
 */
export function walletSupportsNetwork(
	wallet: { chains: readonly string[] } | null | undefined,
	network: SuiNetwork,
) {
	return (
		!wallet || wallet.chains.includes(`sui:${network}`)
	);
}

export function useNetwork() {
	const dappKit = useDAppKit();
	const network = useCurrentNetwork();
	const { wallet } = useWalletConnection();

	return {
		network: network as SuiNetwork,
		setNetwork: (network: SuiNetwork) => {
			if (!walletSupportsNetwork(wallet, network)) {
				toast.error(`Not available in ${wallet?.name}`);
				return;
			}
			dappKit.switchNetwork(network);
			localStorage.setItem(
				LocalStorageKeys.SuiNetwork,
				network,
			);
		},
		isTestMode: network !== 'mainnet',
	};
}
