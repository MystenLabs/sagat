// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Keypair } from '@mysten/sui/cryptography';
import {
	getFaucetHost,
	requestSuiFromFaucetV2,
} from '@mysten/sui/faucet';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import type { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';

export function getLocalClient(): SuiGrpcClient {
	return new SuiGrpcClient({
		network: 'localnet',
		baseUrl: getJsonRpcFullnodeUrl('localnet'),
	});
}

export async function isNetworkRunning(): Promise<boolean> {
	try {
		await getLocalClient().getReferenceGasPrice();
		return true;
	} catch {
		return false;
	}
}

// Funds an address from the local faucet.
export async function fundAddress(address: string) {
	await requestSuiFromFaucetV2({
		host: getFaucetHost('localnet'),
		recipient: normalizeSuiAddress(address),
	});
}

// Signs and executes `tx`, and waits for the node to index it.
export async function executeTransaction(
	signer: Keypair,
	tx: Transaction,
) {
	const client = getLocalClient();
	const result = await signer.signAndExecuteTransaction({
		transaction: tx,
		client,
	});
	if (result.$kind !== 'Transaction')
		throw new Error('Transaction failed to execute.');
	await client.waitForTransaction({
		digest: result.Transaction.digest,
	});
}
