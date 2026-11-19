// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type SuiGrpcClient } from '@mysten/sui/grpc';
import {
	isValidSuiAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import DataLoader from 'dataloader';

import {
	ALIAS_OBJECT_INCLUDE,
	decodeAliasSet,
	deriveAliasesObjectId,
	type AliasSet,
} from '../utils/aliases';
import {
	getSuiClient,
	type SuiNetwork,
} from '../utils/client';

export const ALIAS_SET_BATCH_SIZE = 50;
export const ALIAS_SET_BATCH_WINDOW_MS = 50;

export type AliasObjectReader = Pick<
	SuiGrpcClient,
	'getObjects'
>;

// One loader per network, keyed by account address.
export type AliasSetLoaders = (
	network: SuiNetwork,
) => DataLoader<string, AliasSet>;

const loadAliasSets =
	(client: AliasObjectReader) =>
	async (
		addresses: readonly string[],
	): Promise<(AliasSet | Error)[]> => {
		const owners = addresses.map((address) =>
			normalizeSuiAddress(address),
		);
		// Several requests can ask for one account in a batch; read it once.
		const unique = [...new Set(owners)];
		const valid = unique.filter(isValidSuiAddress);
		const { objects } = valid.length
			? await client.getObjects({
					objectIds: valid.map(deriveAliasesObjectId),
					include: ALIAS_OBJECT_INCLUDE,
				})
			: { objects: [] };
		const sets = new Map<string, AliasSet | Error>(
			unique.map((owner) => [
				owner,
				new Error(`${owner} is not a Sui address`),
			]),
		);
		valid.forEach((owner, i) => {
			try {
				sets.set(owner, decodeAliasSet(owner, objects[i]));
			} catch (error) {
				sets.set(
					owner,
					error instanceof Error
						? error
						: new Error(String(error)),
				);
			}
		});
		return owners.map((owner) => sets.get(owner)!);
	};

// Shared across requests: no cache, so every load reads the chain.
export const createAliasSetLoaders = (
	clientFor: (
		network: SuiNetwork,
	) => AliasObjectReader = getSuiClient,
): AliasSetLoaders => {
	const loaders = new Map<
		SuiNetwork,
		DataLoader<string, AliasSet>
	>();
	return (network) => {
		let loader = loaders.get(network);
		if (!loader) {
			loader = new DataLoader(
				loadAliasSets(clientFor(network)),
				{
					maxBatchSize: ALIAS_SET_BATCH_SIZE,
					cache: false,
					batchScheduleFn: (callback) =>
						setTimeout(callback, ALIAS_SET_BATCH_WINDOW_MS),
				},
			);
			loaders.set(network, loader);
		}
		return loader;
	};
};

export const aliasSetLoaders = createAliasSetLoaders();
