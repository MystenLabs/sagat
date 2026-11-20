// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import {
	ObjectError,
	type SuiClientTypes,
} from '@mysten/sui/client';
import {
	deriveObjectID,
	normalizeStructTag,
	normalizeSuiAddress,
} from '@mysten/sui/utils';

/** The `AddressAliasState` singleton (shared object). */
export const ADDRESS_ALIAS_STATE_ID =
	normalizeSuiAddress('0xa');

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

export type AliasSet = {
	objectId: string;
	aliases: string[];
} & (
	| {
			exists: true;
			/** Version of the `AddressAliases` object. */
			version: string;
			/** Digest of the transaction that last changed the object. */
			previousTransaction: string;
	  }
	| {
			/** The address never called `enable`. The alias set is then `{address}`. */
			exists: false;
			version: null;
			previousTransaction: null;
	  }
);

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

export const ALIAS_OBJECT_INCLUDE = {
	content: true,
	previousTransaction: true,
} as const;

type AliasObjectEntry =
	| SuiClientTypes.Object<typeof ALIAS_OBJECT_INCLUDE>
	| Error;

/** The alias set of `owner` from its entry of a `getObjects` response. Throws on a read error. */
export function decodeAliasSet(
	owner: string,
	entry: AliasObjectEntry,
): AliasSet {
	const objectId = deriveAliasesObjectId(owner);
	if (entry instanceof Error) {
		if (
			entry instanceof ObjectError &&
			entry.reason === 'notFound'
		) {
			return {
				exists: false,
				objectId,
				version: null,
				previousTransaction: null,
				aliases: [owner],
			};
		}
		throw entry;
	}

	if (normalizeSuiAddress(entry.objectId) !== objectId) {
		throw new Error(
			`Object ${entry.objectId} came back for ${objectId}`,
		);
	}
	if (
		normalizeStructTag(entry.type) !== ADDRESS_ALIASES_TYPE
	) {
		throw new Error(
			`Object ${objectId} has type ${entry.type}, expected ${ADDRESS_ALIASES_TYPE}`,
		);
	}
	if (!entry.previousTransaction) {
		throw new Error(
			`Object ${objectId} came back without its previous transaction`,
		);
	}

	const decoded = AddressAliasesBcs.parse(entry.content);
	return {
		exists: true,
		objectId,
		version: entry.version,
		previousTransaction: entry.previousTransaction,
		aliases: decoded.aliases.contents.map((a) =>
			normalizeSuiAddress(a),
		),
	};
}
