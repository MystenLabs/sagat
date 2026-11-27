// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ALIAS_OBJECT_INCLUDE } from '@mysten/sagat';
import { type SuiClientTypes } from '@mysten/sui/client';

import {
	createAliasSetLoaders,
	type AliasObjectReader,
} from '../../src/loaders/alias-set.loader';
import { getLocalClient } from './sui-network';

const client = getLocalClient();

export type AliasObjects =
	SuiClientTypes.GetObjectsResponse<
		typeof ALIAS_OBJECT_INCLUDE
	>;

export const readObjects = (objectIds: string[]) =>
	client.getObjects({
		objectIds,
		include: ALIAS_OBJECT_INCLUDE,
	});

// Loaders over a reader that answers with `serve` and counts its calls.
export const serving = (
	serve: (objectIds: string[]) => Promise<AliasObjects>,
) => {
	let calls = 0;
	let lastIds: string[] = [];
	const reader: AliasObjectReader = {
		getObjects: async <
			Include extends SuiClientTypes.ObjectInclude = object,
		>(
			input: SuiClientTypes.GetObjectsOptions<Include>,
		) => {
			calls++;
			lastIds = input.objectIds;
			return (await serve(
				input.objectIds,
			)) as unknown as SuiClientTypes.GetObjectsResponse<Include>;
		},
	};
	return {
		loaders: createAliasSetLoaders(() => reader),
		calls: () => calls,
		lastIds: () => lastIds,
	};
};
