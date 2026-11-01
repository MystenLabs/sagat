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
/**
 * Objects a call asks for after one that kept nothing, to get through a
 * run of coins. The node would take up to 1000, but each object comes back
 * with its content and Display.
 */
export const SCAN_LIMIT = 50;
/**
 * Node calls one page may take, re-reads included: enough to scan about
 * 1,200 objects when they are coins. The node orders objects by type, so
 * `0x2::coin::Coin` comes ahead of nearly everything, and the list leaves
 * coins out. Past this many calls the page shows what it found and the
 * next one carries on, so a pod with more coins than that can still open
 * on a blank page with Next.
 */
export const MAX_NODE_CALLS = 25;

/** Where a page of objects starts: the node's cursor, `null` for the first. */
export type PageStart = string | null;

export const FIRST_PAGE: PageStart = null;

export interface NodePage<T> {
	objects: T[];
	cursor: string | null;
	hasNextPage: boolean;
}

export interface FilledPage<T> {
	rows: T[];
	/** Where the next page starts, or null when nothing is left. */
	next: string | null;
}

/**
 * Fills one page with up to `size` objects that `keep` accepts, reading
 * node pages from `start` on. A call asks for the rows still missing, or
 * for `SCAN_LIMIT` after a call that kept nothing. When that brings more
 * rows than fit, the same place is read again up to the last row that
 * fits, so the next page starts at a cursor from the node and not at an
 * offset. A cursor is a place in the node's order, not a count, so going
 * forward shows every object the pod keeps once, even when earlier ones
 * leave between two pages.
 *
 * A page isn't always full, and a next page isn't always worth opening. It
 * takes at most `maxCalls` node calls, and when they run out it may be
 * short, even empty, with more after it. A full page whose remaining node
 * pages hold only objects `keep` turns down still has a next page, which
 * comes back empty.
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
		limit: number,
	) => Promise<NodePage<T>>;
	maxCalls?: number;
}): Promise<FilledPage<T>> {
	const rows: T[] = [];
	let cursor = start;
	let limit = size;
	for (let call = 0; call < maxCalls; call++) {
		const page = await fetchNodePage(cursor, limit);
		const kept = page.objects.filter(keep);
		const room = size - rows.length;
		if (kept.length > room) {
			limit = page.objects.indexOf(kept[room - 1]) + 1;
			continue;
		}
		rows.push(...kept);
		if (!page.hasNextPage) return { rows, next: null };
		cursor = page.cursor;
		if (rows.length === size) break;
		limit =
			kept.length === 0 ? SCAN_LIMIT : size - rows.length;
	}
	return { rows, next: cursor };
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
