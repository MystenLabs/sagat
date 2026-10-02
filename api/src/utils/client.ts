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
	client.getChainIdentifier = withMetrics(
		network,
		'getChainIdentifier',
		client.getChainIdentifier.bind(client),
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
