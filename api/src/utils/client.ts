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
	client.getChainIdentifier = withMetrics(
		network,
		'getChainIdentifier',
		client.getChainIdentifier.bind(client),
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

// The chain identifiers of the networks that are never wiped, so checking
// against them doesn't depend on what a fullnode answers.
const KNOWN_CHAIN_IDENTIFIERS: Partial<
	Record<SuiNetwork, string>
> = {
	mainnet: '4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S',
	testnet: '69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD',
};

type ChainInfo = {
	systemState: SuiClientTypes.SystemStateInfo;
	chainIdentifier: string;
};

const chainInfos = new Map<
	SuiNetwork,
	{ expiresAt: number; chainInfo: Promise<ChainInfo> }
>();

// The network's current system state and chain identifier, shared between
// requests until its epoch is due to end. Epochs only move forward, so a
// shared state can only be a little behind, which at worst notices an
// expiration late.
export const getChainInfo = (network: SuiNetwork) => {
	const cached = chainInfos.get(network);
	if (cached && Date.now() < cached.expiresAt)
		return cached.chainInfo;

	const client = getSuiClient(network);
	const knownChainIdentifier =
		KNOWN_CHAIN_IDENTIFIERS[network];
	const entry = {
		// Shared by the requests that come in while it loads.
		expiresAt: Infinity,
		chainInfo: Promise.all([
			client.getCurrentSystemState(),
			knownChainIdentifier ??
				client
					.getChainIdentifier()
					.then(({ chainIdentifier }) => chainIdentifier),
		]).then(([{ systemState }, chainIdentifier]) => {
			entry.expiresAt =
				Number(systemState.epochStartTimestampMs) +
				Number(systemState.parameters.epochDurationMs);
			return { systemState, chainIdentifier };
		}),
	};
	entry.chainInfo.catch(() => {
		if (chainInfos.get(network) === entry)
			chainInfos.delete(network);
	});
	chainInfos.set(network, entry);
	return entry.chainInfo;
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
		const timestamp =
			response.checkpoint?.summary?.timestamp;
		if (!timestamp)
			throw new Error(
				`Checkpoint ${sequenceNumber} has no timestamp`,
			);
		// Rounded up, so it's never earlier than the checkpoint.
		return (
			Number(timestamp.seconds) * 1000 +
			Math.ceil(timestamp.nanos / 1_000_000)
		);
	})();

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
