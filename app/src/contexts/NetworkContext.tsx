// Copyright (c) Mysten Labs, Inc.
// Modifications Copyright (c) 2025 IOTA Stiftung
// SPDX-License-Identifier: Apache-2.0

import { useIotaClientContext } from '@iota/dapp-kit';

export type IotaNetwork = 'testnet' | 'mainnet';

export function useNetwork() {
	const clientCtx = useIotaClientContext();

	return {
		network: clientCtx.network as IotaNetwork,
		setNetwork: (network: IotaNetwork) => {
			clientCtx.selectNetwork(network);
			localStorage.setItem('iotaNetwork', network);
		},
		isTestMode: clientCtx.network === 'testnet',
	};
}
