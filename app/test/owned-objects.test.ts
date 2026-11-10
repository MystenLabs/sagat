// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import {
	fillPage,
	FIRST_PAGE,
	MAX_NODE_CALLS,
	type FilledPage,
	type NodePage,
	type PageStart,
} from '../src/lib/owned-objects';

// A node holding `objects` in order. A cursor is a place in that order, as
// on a real node, so it stays put when an earlier object leaves.
function node(objects: string[]) {
	const removed = new Set<string>();
	const limits: number[] = [];
	const fetchNodePage = async (
		cursor: string | null,
		limit: number,
	): Promise<NodePage<string>> => {
		limits.push(limit);
		const page: string[] = [];
		let at = cursor === null ? 0 : Number(cursor);
		for (; at < objects.length; at++) {
			if (removed.has(objects[at])) continue;
			if (page.length === limit) break;
			page.push(objects[at]);
		}
		const hasNextPage = at < objects.length;
		return {
			objects: page,
			cursor: hasNextPage ? String(at) : null,
			hasNextPage,
		};
	};
	return {
		fetchNodePage,
		limits,
		remove: (object: string) => removed.add(object),
	};
}

const notCoin = (object: string) =>
	!object.startsWith('coin');

describe('fillPage', () => {
	test('pages through every kept object once, each call asking only for the rows still needed', async () => {
		const { fetchNodePage, limits } = node([
			'a',
			'coin1',
			'b',
			'c',
			'coin2',
			'd',
			'e',
		]);
		const pages: string[][] = [];
		let start: PageStart = FIRST_PAGE;
		do {
			const page: FilledPage<string> = await fillPage({
				start,
				size: 2,
				keep: notCoin,
				fetchNodePage,
			});
			pages.push(page.rows);
			start = page.next;
		} while (start);
		expect(pages).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
		// A coin in a call leaves one row to ask for in the next.
		expect(limits).toEqual([2, 1, 2, 1, 2]);
	});

	test('stops after the call cap, and the next page carries on', async () => {
		const coins = Array.from(
			{ length: 500 },
			(_, i) => `coin${i}`,
		);
		const { fetchNodePage, limits } = node(coins);
		const page = await fillPage({
			start: FIRST_PAGE,
			size: 20,
			keep: notCoin,
			fetchNodePage,
			maxCalls: 10,
		});
		expect(limits).toHaveLength(10);
		// One call of 20, then nine of 50.
		expect(page).toEqual({ rows: [], next: '470' });
	});

	test('finds the objects behind a long run of coins within the call cap', async () => {
		const coins = Array.from(
			{ length: 1200 },
			(_, i) => `coin${i}`,
		);
		const objects = ['a', 'b', 'c', 'd', 'e'];
		const { fetchNodePage, limits } = node([
			...coins,
			...objects,
		]);
		const page = await fillPage({
			start: FIRST_PAGE,
			size: 20,
			keep: notCoin,
			fetchNodePage,
		});
		expect(page).toEqual({ rows: objects, next: null });
		expect(limits.length).toBeLessThanOrEqual(
			MAX_NODE_CALLS,
		);
	});

	test('a scan bringing more rows than fit loses and repeats nothing across pages', async () => {
		const objects = Array.from(
			{ length: 12 },
			(_, i) => `o${i}`,
		);
		const coins = Array.from(
			{ length: 7 },
			(_, i) => `coin${i}`,
		);
		const { fetchNodePage, limits } = node([
			...coins,
			...objects,
		]);
		const pages: string[][] = [];
		let start: PageStart = FIRST_PAGE;
		do {
			const page: FilledPage<string> = await fillPage({
				start,
				size: 5,
				keep: notCoin,
				fetchNodePage,
			});
			pages.push(page.rows);
			start = page.next;
		} while (start);
		expect(pages).toEqual([
			objects.slice(0, 5),
			objects.slice(5, 10),
			objects.slice(10),
		]);
		// Five coins, then a scan that overflows, then the same place again
		// up to the fifth object: two coins and five objects.
		expect(limits).toEqual([5, 50, 7, 5, 5]);
	});

	test('an object leaving between two pages drops no later one', async () => {
		const { fetchNodePage, remove } = node([
			'a',
			'b',
			'c',
			'd',
		]);
		const first = await fillPage({
			start: FIRST_PAGE,
			size: 2,
			keep: notCoin,
			fetchNodePage,
		});
		expect(first.rows).toEqual(['a', 'b']);

		remove('a');

		const second = await fillPage({
			start: first.next,
			size: 2,
			keep: notCoin,
			fetchNodePage,
		});
		expect(second.rows).toEqual(['c', 'd']);
	});
});
