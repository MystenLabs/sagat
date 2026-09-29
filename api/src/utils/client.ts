// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ObjectError,
	type SuiClientTypes,
} from '@mysten/sui/client';
import { SuiGrpcClient } from '@mysten/sui/grpc';

import { SUI_RPC_URL } from '../db/env';
import {
	rpcRequestDuration,
	rpcRequestErrors,
} from '../metrics';

export type SuiNetwork =
	'mainnet' | 'testnet' | 'devnet' | 'localnet';

// Wraps an RPC method to record its duration and errors. The wrapper keeps
// the method's own (generic) signature, so it doesn't need updating when the
// SDK's types change.
const withMetrics = <
	F extends (...args: never[]) => Promise<unknown>,
>(
	network: SuiNetwork,
	method: string,
	fn: F,
): F =>
	(async (...args: Parameters<F>) => {
		const start = Date.now();
		try {
			return await fn(...args);
		} catch (error) {
			rpcRequestErrors.inc({
				network,
				method,
				error_type:
					error instanceof Error ? error.name : 'unknown',
			});
			throw error;
		} finally {
			rpcRequestDuration.observe(
				{ network, method },
				(Date.now() - start) / 1000,
			);
		}
	}) as F;

// Create a wrapper that instruments RPC calls with metrics
const createInstrumentedClient = (
	network: SuiNetwork,
	client: SuiGrpcClient,
) => {
	client.getObjects = withMetrics(
		network,
		'getObjects',
		client.getObjects.bind(client),
	);
	client.getTransaction = withMetrics(
		network,
		'getTransaction',
		client.getTransaction.bind(client),
	);
	client.getCurrentSystemState = withMetrics(
		network,
		'getCurrentSystemState',
		client.getCurrentSystemState.bind(client),
	);

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

// The current version of each object, or null for one that no longer exists
// (or never did).
export const getObjectVersions = async (
	objectIds: string[],
	network: SuiNetwork,
) => {
	const versions = new Map<string, string | null>();
	if (objectIds.length === 0) return versions;

	// The SDK splits these into as many requests as it needs.
	const uniqueObjectIds = Array.from(new Set(objectIds));
	const { objects } = await getSuiClient(
		network,
	).getObjects({ objectIds: uniqueObjectIds });

	objects.forEach((object, i) => {
		if (!(object instanceof Error))
			versions.set(uniqueObjectIds[i], object.version);
		else if (
			object instanceof ObjectError &&
			object.reason !== 'unknown'
		)
			versions.set(uniqueObjectIds[i], null);
		else throw object;
	});

	return versions;
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
