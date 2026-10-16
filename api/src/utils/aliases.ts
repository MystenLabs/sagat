// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import {
	ObjectError,
	type ClientWithCoreApi,
} from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';
import {
	deriveObjectID,
	normalizeStructTag,
	normalizeSuiAddress,
} from '@mysten/sui/utils';

/** The `AddressAliasState` singleton (shared object). */
export const ADDRESS_ALIAS_STATE_ID =
	normalizeSuiAddress('0xa');

/** Protocol limit on the size of an alias set (`address_alias::MAX_ALIASES`). */
export const MAX_ALIASES = 8;

const MODULE = '0x2::address_alias';
const ALIAS_KEY_TYPE = `${MODULE}::AliasKey`;
const ADDRESS_ALIASES_TYPE = normalizeStructTag(
	`${MODULE}::AddressAliases`,
);

/**
 * BCS layout of `0x2::address_alias::AddressAliases`:
 * `{ id: UID, aliases: VecSet<address> }`, where `UID` is a 32 byte address
 * and `VecSet<T>` is `{ contents: vector<T> }`.
 */
export const AddressAliasesBcs = bcs.struct(
	'AddressAliases',
	{
		id: bcs.Address,
		aliases: bcs.struct('VecSet', {
			contents: bcs.vector(bcs.Address),
		}),
	},
);

export interface AliasSet {
	/** False when the address never called `enable`. The alias set is then `{address}`. */
	exists: boolean;
	objectId: string;
	/** Version of the `AddressAliases` object, or null when it does not exist. */
	version: string | null;
	aliases: string[];
}

/**
 * Id of the `AddressAliases` object of `address`: a derived object with parent
 * `0xa` and key `AliasKey(address)`.
 */
export function deriveAliasesObjectId(
	address: string,
): string {
	return deriveObjectID(
		ADDRESS_ALIAS_STATE_ID,
		ALIAS_KEY_TYPE,
		bcs.Address.serialize(address).toBytes(),
	);
}

/** Read the on-chain alias set of `address`. */
export async function fetchAliasSet(
	client: ClientWithCoreApi,
	address: string,
): Promise<AliasSet> {
	const owner = normalizeSuiAddress(address);
	const objectId = deriveAliasesObjectId(owner);
	const {
		objects: [object],
	} = await client.core.getObjects({
		objectIds: [objectId],
		include: { content: true },
	});

	if (object instanceof Error) {
		if (
			object instanceof ObjectError &&
			object.reason === 'notFound'
		) {
			return {
				exists: false,
				objectId,
				version: null,
				aliases: [owner],
			};
		}
		throw object;
	}

	if (
		normalizeStructTag(object.type) !== ADDRESS_ALIASES_TYPE
	) {
		throw new Error(
			`Object ${objectId} has type ${object.type}, expected ${ADDRESS_ALIASES_TYPE}`,
		);
	}

	const decoded = AddressAliasesBcs.parse(object.content);
	return {
		exists: true,
		objectId,
		version: object.version,
		aliases: decoded.aliases.contents.map((a) =>
			normalizeSuiAddress(a),
		),
	};
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
