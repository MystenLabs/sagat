// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { createNetworkConfig } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';

const {
	networkConfig,
	useNetworkVariable,
	useNetworkVariables,
} = createNetworkConfig({
	testnet: {
		url: getFullnodeUrl('testnet'),
	},
	mainnet: {
		url: getFullnodeUrl('mainnet'),
	},
});

export {
	useNetworkVariable,
	useNetworkVariables,
	networkConfig,
};
