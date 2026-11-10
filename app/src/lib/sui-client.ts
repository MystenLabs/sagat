// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SuiGrpcClient } from '@mysten/sui/grpc';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

export const newClient = (
	network: 'testnet' | 'mainnet' | 'devnet' | 'localnet',
) => {
	return new SuiGrpcClient({
		network,
		baseUrl:
			(network === 'localnet' &&
				import.meta.env.VITE_LOCALNET_RPC_URL) ||
			getJsonRpcFullnodeUrl(network),
	});
};
