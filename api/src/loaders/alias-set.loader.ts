// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type SuiGrpcClient } from '@mysten/sui/grpc';
import { normalizeSuiAddress } from '@mysten/sui/utils';
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
		const { objects } = await client.getObjects({
			objectIds: owners.map(deriveAliasesObjectId),
			include: ALIAS_OBJECT_INCLUDE,
		});
		return owners.map((owner, i) => {
			try {
				return decodeAliasSet(owner, objects[i]);
			} catch (error) {
				return error instanceof Error
					? error
					: new Error(String(error));
			}
		});
	};

// Create once per request: no cache, so every load reads the chain.
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
				},
			);
			loaders.set(network, loader);
		}
		return loader;
	};
};
