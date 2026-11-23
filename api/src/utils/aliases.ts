// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ALIAS_OBJECT_INCLUDE,
	decodeAliasSet,
	deriveAliasesObjectId,
	type AliasSet,
} from '@mysten/sagat';
import { type ClientWithCoreApi } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';

export {
	buildAdd,
	buildEnable,
	buildRemove,
} from '@mysten/sagat';

/** Read the on-chain alias set of `address`. */
export async function fetchAliasSet(
	client: ClientWithCoreApi,
	address: string,
): Promise<AliasSet> {
	const owner = normalizeSuiAddress(address);
	const {
		objects: [entry],
	} = await client.core.getObjects({
		objectIds: [deriveAliasesObjectId(owner)],
		include: ALIAS_OBJECT_INCLUDE,
	});
	return decodeAliasSet(owner, entry);
}
