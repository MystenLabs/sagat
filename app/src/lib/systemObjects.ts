// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import {
	normalizeStructTag,
	normalizeSuiAddress,
	parseStructTag,
} from '@mysten/sui/utils';

import { content } from '../content';
import { formatTypeParam } from './coin-type';

const COPY = content.assets.objects;

/** The framework objects the objects list knows and describes. */
export type SystemObjectKind =
	| 'upgradeCap'
	| 'publisher'
	| 'display'
	| 'treasuryCap'
	| 'coinMetadata'
	| 'kioskOwnerCap'
	| 'transferPolicyCap';

/** Each system object's type, without type parameters. */
export const SYSTEM_OBJECT_TYPES: Record<
	SystemObjectKind,
	string
> = {
	upgradeCap: '0x2::package::UpgradeCap',
	publisher: '0x2::package::Publisher',
	display: '0x2::display::Display',
	treasuryCap: '0x2::coin::TreasuryCap',
	coinMetadata: '0x2::coin::CoinMetadata',
	kioskOwnerCap: '0x2::kiosk::KioskOwnerCap',
	transferPolicyCap:
		'0x2::transfer_policy::TransferPolicyCap',
};

export const SYSTEM_OBJECT_KINDS = Object.keys(
	SYSTEM_OBJECT_TYPES,
) as SystemObjectKind[];

/** A system type's struct name, e.g. `UpgradeCap`. */
export function systemTypeName(
	kind: SystemObjectKind,
): string {
	return parseStructTag(SYSTEM_OBJECT_TYPES[kind]).name;
}

// Each one's struct tag, matched on address, module and name alone.
const SYSTEM_TAGS = SYSTEM_OBJECT_KINDS.map(
	(kind) =>
		[
			kind,
			parseStructTag(SYSTEM_OBJECT_TYPES[kind]),
		] as const,
);

/** Which system object `type` is, whatever its type parameters, or null. */
export function systemKindOf(
	type: string,
): SystemObjectKind | null {
	let tag;
	try {
		tag = parseStructTag(type);
	} catch {
		return null;
	}
	const match = SYSTEM_TAGS.find(
		([, system]) =>
			system.address === tag.address &&
			system.module === tag.module &&
			system.name === tag.name,
	);
	return match ? match[0] : null;
}

// The framework's layouts (sui-framework `package.move`, `kiosk.move`),
// for the fields shown. A UID and an ID are both 32 bytes of address.
const UpgradeCap = bcs.struct('UpgradeCap', {
	id: bcs.Address,
	package: bcs.Address,
	version: bcs.u64(),
	policy: bcs.u8(),
});
const Publisher = bcs.struct('Publisher', {
	id: bcs.Address,
	// An ascii string: the package's address in hex without `0x`.
	package: bcs.string(),
	module_name: bcs.string(),
});
const KioskOwnerCap = bcs.struct('KioskOwnerCap', {
	id: bcs.Address,
	for: bcs.Address,
});

/** `UpgradeCap.policy`'s values, from `package.move`. */
const UPGRADE_POLICIES: Record<number, string> = {
	0: COPY.policy.compatible,
	128: COPY.policy.additive,
	192: COPY.policy.dependencyOnly,
	255: COPY.policy.immutable,
};

/**
 * A piece of an object's subtitle: text, or an object id to show short
 * after its label (`package`, `kiosk`). Ids come last, so their copy
 * button ends the line.
 */
export type SubtitlePart =
	| { kind: 'text'; text: string }
	| { kind: 'id'; label: string; id: string };

/** An owned object as the objects list shows it. */
export interface ObjectView {
	objectId: string;
	type: string;
	kind: SystemObjectKind | 'other';
	name: string;
	subtitle: SubtitlePart[];
}

export interface OwnedObjectInput {
	objectId: string;
	type: string;
	/** The object's Move struct, in BCS. */
	content?: Uint8Array | null;
	display?: {
		output: Record<string, unknown> | null;
	} | null;
}

/**
 * How the objects list shows `object`. A system object is named by its
 * struct and described from its own content: an UpgradeCap by its
 * version, policy and package, a Publisher by its module and package, a
 * KioskOwnerCap by its kiosk, and the caps, metadata and Display of a
 * type by that type (a recognised coin's symbol from `coinSymbol`, else
 * the type in short form). Any other object is named by its Display name, if
 * it has one, or its struct, over its module. Display images are never
 * used: their URLs are the issuer's.
 */
export function objectView(
	object: OwnedObjectInput,
	coinSymbol: (coinType: string) => string | undefined,
): ObjectView {
	const base = {
		objectId: object.objectId,
		type: object.type,
	};
	let tag;
	try {
		tag = parseStructTag(object.type);
	} catch {
		return {
			...base,
			kind: 'other',
			name: object.type,
			subtitle: [],
		};
	}
	const kind = systemKindOf(object.type);
	if (kind) {
		try {
			return {
				...base,
				kind,
				name: tag.name,
				subtitle: systemSubtitle(
					kind,
					object.content,
					tag.typeParams[0],
					coinSymbol,
				),
			};
		} catch {
			// Content that doesn't parse: shown like any other object.
		}
	}
	const displayName = object.display?.output?.name;
	return {
		...base,
		kind: 'other',
		name:
			typeof displayName === 'string' && displayName.trim()
				? displayName.trim()
				: tag.name,
		subtitle: [{ kind: 'text', text: tag.module }],
	};
}

type TypeParam = ReturnType<
	typeof parseStructTag
>['typeParams'][number];

function systemSubtitle(
	kind: SystemObjectKind,
	bytes: Uint8Array | null | undefined,
	param: TypeParam | undefined,
	coinSymbol: (coinType: string) => string | undefined,
): SubtitlePart[] {
	switch (kind) {
		case 'upgradeCap': {
			const cap = UpgradeCap.parse(required(bytes));
			return [
				{ kind: 'text', text: COPY.version(cap.version) },
				{
					kind: 'text',
					text:
						UPGRADE_POLICIES[cap.policy] ??
						COPY.policy.unknown(cap.policy),
				},
				{
					kind: 'id',
					label: COPY.idLabels.package,
					id: cap.package,
				},
			];
		}
		case 'publisher': {
			const publisher = Publisher.parse(required(bytes));
			return [
				{ kind: 'text', text: publisher.module_name },
				{
					kind: 'id',
					label: COPY.idLabels.package,
					id: normalizeSuiAddress(publisher.package),
				},
			];
		}
		case 'kioskOwnerCap':
			return [
				{
					kind: 'id',
					label: COPY.idLabels.kiosk,
					id: KioskOwnerCap.parse(required(bytes)).for,
				},
			];
		case 'display':
		case 'treasuryCap':
		case 'coinMetadata':
		case 'transferPolicyCap':
			return [
				{
					kind: 'text',
					text: typeParamLabel(param, coinSymbol),
				},
			];
	}
}

function required(
	bytes: Uint8Array | null | undefined,
): Uint8Array {
	if (!bytes) throw new Error('No content');
	return bytes;
}

/**
 * The type a cap or metadata is for: a recognised coin's symbol, else the
 * type in short form, with its package unless it is the framework's, so a
 * look-alike coin reads differently from the real one.
 */
function typeParamLabel(
	param: TypeParam | undefined,
	coinSymbol: (coinType: string) => string | undefined,
): string {
	if (param === undefined) throw new Error('No type');
	const symbol =
		typeof param === 'string'
			? undefined
			: coinSymbol(normalizeStructTag(param));
	return symbol ?? formatTypeParam(param);
}
