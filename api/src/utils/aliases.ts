// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ADDRESS_ALIAS_STATE_ID,
	ALIAS_OBJECT_INCLUDE,
	decodeAliasSet,
	deriveAliasesObjectId,
	type AliasSet,
} from '@mysten/sagat';
import { type ClientWithCoreApi } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';

/** Protocol limit on the size of an alias set (`address_alias::MAX_ALIASES`). */
export const MAX_ALIASES = 8;

const MODULE = '0x2::address_alias';

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

/**
 * Append `address_alias::enable` for the transaction sender. Creates the
 * sender's `AddressAliases` object with the set `{sender}`. The object cannot
 * be used later in the same transaction.
 */
export function buildEnable(tx: Transaction) {
	tx.moveCall({
		target: `${MODULE}::enable`,
		arguments: [tx.object(ADDRESS_ALIAS_STATE_ID)],
	});
}

/** Append `address_alias::add(alias)` to `account`'s alias set. The sender must be `account`. */
export function buildAdd(
	tx: Transaction,
	{ account, alias }: { account: string; alias: string },
) {
	tx.moveCall({
		target: `${MODULE}::add`,
		arguments: [
			tx.object(deriveAliasesObjectId(account)),
			tx.pure.address(alias),
		],
	});
}

/** Append `address_alias::remove(alias)` from `account`'s alias set. The sender must be `account`. */
export function buildRemove(
	tx: Transaction,
	{ account, alias }: { account: string; alias: string },
) {
	tx.moveCall({
		target: `${MODULE}::remove`,
		arguments: [
			tx.object(deriveAliasesObjectId(account)),
			tx.pure.address(alias),
		],
	});
}
