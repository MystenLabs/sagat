// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	SuiClient,
	type SuiObjectData,
} from '@mysten/sui/client';

import { SUI_RPC_URL } from '../db/env';
import {
	rpcRequestDuration,
	rpcRequestErrors,
} from '../metrics';

export type SuiNetwork =
	| 'mainnet'
	| 'testnet'
	| 'devnet'
	| 'localnet';

// Create a wrapper that instruments RPC calls with metrics
const createInstrumentedClient = (
	network: SuiNetwork,
	client: SuiClient,
) => {
	const originalMultiGetObjects =
		client.multiGetObjects.bind(client);
	const originalGetTransactionBlock =
		client.getTransactionBlock.bind(client);

	client.multiGetObjects = async (
		...args: Parameters<typeof originalMultiGetObjects>
	) => {
		const start = Date.now();
		try {
			const result = await originalMultiGetObjects(...args);
			const duration = (Date.now() - start) / 1000;
			rpcRequestDuration.observe(
				{ network, method: 'multiGetObjects' },
				duration,
			);
			return result;
		} catch (error) {
			const duration = (Date.now() - start) / 1000;
			rpcRequestDuration.observe(
				{ network, method: 'multiGetObjects' },
				duration,
			);
			rpcRequestErrors.inc({
				network,
				method: 'multiGetObjects',
				error_type:
					error instanceof Error ? error.name : 'unknown',
			});
			throw error;
		}
	};

	client.getTransactionBlock = async (
		...args: Parameters<typeof originalGetTransactionBlock>
	) => {
		const start = Date.now();
		try {
			const result = await originalGetTransactionBlock(
				...args,
			);
			const duration = (Date.now() - start) / 1000;
			rpcRequestDuration.observe(
				{ network, method: 'getTransactionBlock' },
				duration,
			);
			return result;
		} catch (error) {
			const duration = (Date.now() - start) / 1000;
			rpcRequestDuration.observe(
				{ network, method: 'getTransactionBlock' },
				duration,
			);
			rpcRequestErrors.inc({
				network,
				method: 'getTransactionBlock',
				error_type:
					error instanceof Error ? error.name : 'unknown',
			});
			throw error;
		}
	};

	return client;
};

export const getSuiClient = (network: SuiNetwork) => {
	const client = new SuiClient({
		url: SUI_RPC_URL[network],
	});
	return createInstrumentedClient(network, client);
};

// Query a list of objects
// TODO: use a data loader to share queries across requests.
export const queryAllOwnedObjects = async (
	objectIds: string[],
	network: SuiNetwork,
) => {
	const uniqueObjectIds = Array.from(new Set(objectIds));

	if (uniqueObjectIds.length === 0) {
		return [];
	}

	const batches = batchObjectRequests(uniqueObjectIds, 100);

	const allOwnedObjects: SuiObjectData[] = [];

	// Go through the batches & query the objects, pick out the `AddressOwner` ones.
	await Promise.all(
		batches.map(async (batch) => {
			const objects = await getSuiClient(
				network,
			).multiGetObjects({
				ids: batch,
				options: { showOwner: true },
			});

			for (const object of objects) {
				if (
					object.data?.owner &&
					typeof object.data.owner === 'object' &&
					'AddressOwner' in object.data.owner
				) {
					allOwnedObjects.push(object.data);
				}
			}
		}),
	);

	return allOwnedObjects;
};

function batchObjectRequests<T>(
	objectIds: T[],
	batchSize: number,
) {
	const batches = [];
	for (let i = 0; i < objectIds.length; i += batchSize) {
		batches.push(objectIds.slice(i, i + batchSize));
	}
	return batches;
}
