// Copyright (c) Mysten Labs, Inc.
// Modifications Copyright (c) 2025 IOTA Stiftung
// SPDX-License-Identifier: Apache-2.0

import { createNetworkConfig } from '@iota/dapp-kit';
import { getFullnodeUrl } from '@iota/iota-sdk/client';

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
