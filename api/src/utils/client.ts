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

// The longest to reuse a network's system state. Its epoch only changes when
// the next one is due, but a network can also be wiped and start over (e.g.
// devnet), which a longer wait would miss.
const SYSTEM_STATE_TTL_MS = 60_000;

const systemStates = new Map<
	SuiNetwork,
	{
		expiresAt: number;
		systemState: Promise<SuiClientTypes.SystemStateInfo>;
	}
>();

// The network's current system state, shared between requests until its
// epoch is due to end (or the TTL runs out). Epochs only move forward, so a
// shared one can only be a little behind, which at worst notices an
// expiration late. After a wipe it can be ahead, but for at most the TTL.
export const getSystemState = (network: SuiNetwork) => {
	const cached = systemStates.get(network);
	if (cached && Date.now() < cached.expiresAt)
		return cached.systemState;

	const entry = {
		// Also covers the requests that come in while it loads.
		expiresAt: Date.now() + SYSTEM_STATE_TTL_MS,
		systemState: getSuiClient(network)
			.getCurrentSystemState()
			.then(({ systemState }) => {
				entry.expiresAt = Math.min(
					entry.expiresAt,
					Number(systemState.epochStartTimestampMs) +
						Number(systemState.parameters.epochDurationMs),
				);
				return systemState;
			}),
	};
	entry.systemState.catch(() => {
		if (systemStates.get(network) === entry)
			systemStates.delete(network);
	});
	systemStates.set(network, entry);
	return entry.systemState;
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
