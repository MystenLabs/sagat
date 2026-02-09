// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
	getFaucetHost,
	requestSuiFromFaucetV2,
} from '@mysten/sui/faucet';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { normalizeSuiAddress } from '@mysten/sui/utils';

/**
 * Get a Sui client for localnet
 */
export function getLocalClient(): SuiGrpcClient {
	return new SuiGrpcClient({
		network: 'localnet',
		baseUrl: getJsonRpcFullnodeUrl('localnet'),
	});
}

/**
 * Check if local network is running
 */
export async function isNetworkRunning(): Promise<boolean> {
	try {
		const client = getLocalClient();
		await client.getReferenceGasPrice();
		return true;
	} catch {
		return false;
	}
}

/**
 * Fund an address using the SDK faucet client
 * Assumes local faucet is running on default port 9123
 */
export async function fundAddress(
	address: string,
): Promise<boolean> {
	try {
		const faucetHost = getFaucetHost('localnet');

		await requestSuiFromFaucetV2({
			host: faucetHost,
			recipient: normalizeSuiAddress(address),
		});

		return true;
	} catch (error: any) {
		// Faucet might not be available, but that's ok for some tests
		console.warn(`Faucet funding failed: ${error.message}`);
		return false;
	}
}
