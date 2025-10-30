// Copyright (c) Mysten Labs, Inc.
// Modifications Copyright (c) 2025 IOTA Stiftung
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
	getFullnodeUrl,
	IotaClient,
} from '@iota/iota-sdk/client';
import {
	getFaucetHost,
	requestIotaFromFaucetV1,
} from '@iota/iota-sdk/faucet';
import { normalizeIotaAddress } from '@iota/iota-sdk/utils';

/**
 * Get a IOTA client for localnet
 */
export function getLocalClient(): IotaClient {
	return new IotaClient({ url: getFullnodeUrl('localnet') });
}

/**
 * Check if local network is running
 */
export async function isNetworkRunning(): Promise<boolean> {
	try {
		const client = getLocalClient();
		await client.getLatestCheckpointSequenceNumber();
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

		await requestIotaFromFaucetV1({
			host: faucetHost,
			recipient: normalizeIotaAddress(address),
		});

		return true;
	} catch (error: any) {
		// Faucet might not be available, but that's ok for some tests
		console.warn(`Faucet funding failed: ${error.message}`);
		return false;
	}
}
