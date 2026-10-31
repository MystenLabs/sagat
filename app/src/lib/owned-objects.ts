// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	isValidStructTag,
	isValidSuiAddress,
	normalizeStructTag,
	parseStructTag,
} from '@mysten/sui/utils';

import {
	SYSTEM_OBJECT_TYPES,
	systemKindOf,
} from './systemObjects';
import type { SystemObjectKind } from './systemObjects';

/** Rows on one page of the assets page's objects. */
export const OBJECTS_PAGE_SIZE = 20;
/** Objects asked of the node per call: its own cap. */
export const NODE_PAGE_SIZE = 50;
/**
 * Node calls one page may take. A pod with hundreds of coin objects can
 * fill whole node pages with coins, which the list leaves out; past this
 * many calls the page shows what it found and the next one carries on.
 */
export const MAX_NODE_CALLS = 10;

/**
 * Where a page of objects starts: the node page it begins in, by the
 * cursor that fetches it (`null` for the first), and how many of that
 * node page's objects earlier pages already went through.
 */
export interface PageStart {
	cursor: string | null;
	skip: number;
}

export const FIRST_PAGE: PageStart = {
	cursor: null,
	skip: 0,
};

export interface NodePage<T> {
	objects: T[];
	cursor: string | null;
	hasNextPage: boolean;
}

export interface FilledPage<T> {
	rows: T[];
	/** Where the next page starts, or null when nothing is left. */
	next: PageStart | null;
}

/**
 * Fills one page with up to `size` objects that `keep` accepts, reading
 * node pages from `start` on. Pages are exact: the next one starts at the
 * first object this one didn't take, so none is lost or repeated. It
 * takes at most `maxCalls` node calls; when they run out the page may be
 * short, and the next one starts at the node page after the last read.
 */
export async function fillPage<T>({
	start,
	size,
	keep,
	fetchNodePage,
	maxCalls = MAX_NODE_CALLS,
}: {
	start: PageStart;
	size: number;
	keep: (object: T) => boolean;
	fetchNodePage: (
		cursor: string | null,
	) => Promise<NodePage<T>>;
	maxCalls?: number;
}): Promise<FilledPage<T>> {
	const rows: T[] = [];
	let { cursor, skip } = start;
	for (let call = 0; call < maxCalls; call++) {
		const page = await fetchNodePage(cursor);
		for (let i = skip; i < page.objects.length; i++) {
			const object = page.objects[i];
			if (!keep(object)) continue;
			// A row beyond this page: the next one starts with it.
			if (rows.length === size)
				return { rows, next: { cursor, skip: i } };
			rows.push(object);
		}
		if (!page.hasNextPage) return { rows, next: null };
		cursor = page.cursor;
		skip = 0;
	}
	return { rows, next: { cursor, skip: 0 } };
}

/**
 * What the objects list shows: everything, one system type, every other
 * type ("Other"), or the type typed into the filter field.
 */
export type ObjectsFilter =
	| { kind: 'all' }
	| { kind: 'system'; system: SystemObjectKind }
	| { kind: 'other' }
	| { kind: 'type'; type: string };

/**
 * How to ask the node for `filter`: the `type` it filters on, if any, and
 * which of the objects it returns to keep.
 *
 * The node matches a type without type parameters against every
 * instantiation of it (`0x2::coin::TreasuryCap` lists each
 * `TreasuryCap<T>`), and one with parameters exactly. So a system type is
 * asked for bare, and a typed filter as written. Coins never show, as the
 * tokens tab has them. "Other" can't be put to the node, so it reads all
 * objects and keeps those that are neither coins nor a system type.
 */
export function objectsQuery(filter: ObjectsFilter): {
	type?: string;
	keep: (type: string) => boolean;
} {
	switch (filter.kind) {
		case 'all':
			return { keep: (type) => !isCoinObjectType(type) };
		case 'system':
			return {
				type: SYSTEM_OBJECT_TYPES[filter.system],
				keep: () => true,
			};
		case 'other':
			return {
				keep: (type) =>
					!isCoinObjectType(type) &&
					systemKindOf(type) === null,
			};
		case 'type':
			return {
				type: filter.type,
				keep: (type) => !isCoinObjectType(type),
			};
	}
}

/** A key for `filter`, for query keys. */
export function objectsFilterKey(
	filter: ObjectsFilter,
): string {
	switch (filter.kind) {
		case 'all':
		case 'other':
			return filter.kind;
		case 'system':
			return `system:${filter.system}`;
		case 'type':
			return `type:${filter.type}`;
	}
}

/**
 * The filter field's text as a full struct type in the chain's long form,
 * with or without type parameters, or null when it isn't one. Named (MVR)
 * packages aren't taken: the node needs an address.
 */
export function parseTypeFilter(
	text: string,
): string | null {
	const trimmed = text.trim();
	if (!isValidStructTag(trimmed)) return null;
	const tag = parseStructTag(trimmed);
	if (!isValidSuiAddress(tag.address)) return null;
	return normalizeStructTag(tag);
}

/** Whether `type` is a coin object, `0x2::coin::Coin<T>`. */
export function isCoinObjectType(type: string): boolean {
	try {
		const { address, module, name } = parseStructTag(type);
		return (
			address === COIN_PACKAGE &&
			module === 'coin' &&
			name === 'Coin'
		);
	} catch {
		return false;
	}
}

const COIN_PACKAGE = parseStructTag(
	'0x2::coin::Coin',
).address;
