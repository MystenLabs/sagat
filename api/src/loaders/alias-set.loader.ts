// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ALIAS_OBJECT_INCLUDE,
	decodeAliasSet,
	deriveAliasesObjectId,
	type AliasSet,
} from '@mysten/sagat';
import { type SuiGrpcClient } from '@mysten/sui/grpc';
import {
	isValidSuiAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import DataLoader from 'dataloader';

import { toError } from '../errors';
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

const chunk = <T>(items: T[], size: number): T[][] =>
	Array.from(
		{ length: Math.ceil(items.length / size) },
		(_, i) => items.slice(i * size, (i + 1) * size),
	);

const loadAliasSets =
	(client: AliasObjectReader) =>
	async (
		addresses: readonly string[],
	): Promise<(AliasSet | Error)[]> => {
		const owners = addresses.map((address) =>
			normalizeSuiAddress(address),
		);
		// Several requests can ask for one account in a window; read it once.
		const unique = [...new Set(owners)];
		const sets = new Map<string, AliasSet | Error>(
			unique.map((owner) => [
				owner,
				new Error(`${owner} is not a Sui address`),
			]),
		);
		const readGroup = async (group: string[]) => {
			// A failed call fails only the accounts it carried.
			const objects = await client
				.getObjects({
					objectIds: group.map(deriveAliasesObjectId),
					include: ALIAS_OBJECT_INCLUDE,
				})
				.then((response) => response.objects, toError);
			group.forEach((owner, i) => {
				try {
					if (objects instanceof Error) throw objects;
					sets.set(
						owner,
						decodeAliasSet(owner, objects[i]),
					);
				} catch (error) {
					sets.set(owner, toError(error));
				}
			});
		};
		await Promise.all(
			chunk(
				unique.filter(isValidSuiAddress),
				ALIAS_SET_BATCH_SIZE,
			).map(readGroup),
		);
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
