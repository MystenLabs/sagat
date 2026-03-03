// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { SuiGrpcClient } from '@mysten/sui/grpc';

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
	client: SuiGrpcClient,
) => {
	const originalGetObjects = client.getObjects.bind(client);
	const originalGetTransaction =
		client.getTransaction.bind(client);

	client.getObjects = async <
		Include extends SuiClientTypes.ObjectInclude,
	>(
		input: SuiClientTypes.GetObjectsOptions<Include>,
	) => {
		const start = Date.now();
		try {
			const result = await originalGetObjects(input);
			const duration = (Date.now() - start) / 1000;
			rpcRequestDuration.observe(
				{ network, method: 'getObjects' },
				duration,
			);
			return result;
		} catch (error) {
			const duration = (Date.now() - start) / 1000;
			rpcRequestDuration.observe(
				{ network, method: 'getObjects' },
				duration,
			);
			rpcRequestErrors.inc({
				network,
				method: 'getObjects',
				error_type:
					error instanceof Error ? error.name : 'unknown',
			});
			throw error;
		}
	};

	client.getTransaction = async <
		Include extends SuiClientTypes.TransactionInclude,
	>(
		input: SuiClientTypes.GetTransactionOptions<Include>,
	): Promise<SuiClientTypes.TransactionResult<Include>> => {
		const start = Date.now();
		try {
			const result = await originalGetTransaction(input);
			const duration = (Date.now() - start) / 1000;
			rpcRequestDuration.observe(
				{ network, method: 'getTransaction' },
				duration,
			);
			return result;
		} catch (error) {
			const duration = (Date.now() - start) / 1000;
			rpcRequestDuration.observe(
				{ network, method: 'getTransaction' },
				duration,
			);
			rpcRequestErrors.inc({
				network,
				method: 'getTransaction',
				error_type:
					error instanceof Error ? error.name : 'unknown',
			});
			throw error;
		}
	};

	return client;
};

export const getSuiClient = (network: SuiNetwork) => {
	const client = new SuiGrpcClient({
		network,
		baseUrl: SUI_RPC_URL[network],
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

	const allOwnedObjects: SuiClientTypes.Object[] = [];

	// Go through the batches & query the objects, pick out the `AddressOwner` ones.
	await Promise.all(
		batches.map(async (batch) => {
			const objects = await getSuiClient(
				network,
			).getObjects({
				objectIds: batch,
			});

			for (const object of objects.objects) {
				if (object instanceof Error) {
					throw new Error(
						`Failed to get object: ${object.message}`,
					);
				}
				if (
					object.owner &&
					object.owner.$kind === 'AddressOwner'
				) {
					allOwnedObjects.push(object);
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
