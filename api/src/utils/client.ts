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

	return client;
};

// One client per network, shared between requests.
const clients = new Map<SuiNetwork, SuiGrpcClient>();

export const getSuiClient = (network: SuiNetwork) => {
	let client = clients.get(network);
	if (!client) {
		client = createInstrumentedClient(
			network,
			new SuiGrpcClient({
				network,
				baseUrl: SUI_RPC_URL[network],
			}),
		);
		clients.set(network, client);
	}
	return client;
};

// The current state of each object, or null for one that no longer exists
// (or never did).
export const getCurrentObjects = async (
	objectIds: string[],
	network: SuiNetwork,
) => {
	const objects = new Map<
		string,
		SuiClientTypes.Object | null
	>();
	if (objectIds.length === 0) return objects;

	// The SDK splits these into as many requests as it needs.
	const uniqueObjectIds = Array.from(new Set(objectIds));
	const response = await getSuiClient(network).getObjects({
		objectIds: uniqueObjectIds,
	});

	response.objects.forEach((object, i) => {
		if (!(object instanceof Error))
			objects.set(uniqueObjectIds[i], object);
		else if (
			object instanceof ObjectError &&
			object.reason !== 'unknown'
		)
			objects.set(uniqueObjectIds[i], null);
		else throw object;
	});

	return objects;
};

// When a checkpoint was made, in milliseconds. The SDK's client API has no
// checkpoint lookup, so this goes through the gRPC service directly.
export const getCheckpointTimestamp = (
	network: SuiNetwork,
	sequenceNumber: bigint,
) =>
	withMetrics(network, 'getCheckpoint', async () => {
		const { response } = await getSuiClient(
			network,
		).ledgerService.getCheckpoint({
			checkpointId: {
				oneofKind: 'sequenceNumber',
				sequenceNumber,
			},
			readMask: { paths: ['summary.timestamp'] },
		});
		const seconds =
			response.checkpoint?.summary?.timestamp?.seconds;
		if (seconds == null)
			throw new Error(
				`Checkpoint ${sequenceNumber} has no timestamp`,
			);
		return Number(seconds) * 1000;
	})();
