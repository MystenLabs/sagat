// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import {
	fillPage,
	FIRST_PAGE,
	type NodePage,
	type PageStart,
} from '../src/lib/owned-objects';

// A node that serves `pages` in order: cursor `null` is the first, `p<i>`
// the i-th.
function node(pages: string[][]) {
	let calls = 0;
	const fetchNodePage = async (
		cursor: string | null,
	): Promise<NodePage<string>> => {
		calls++;
		const index =
			cursor === null ? 0 : Number(cursor.slice(1));
		const hasNextPage = index + 1 < pages.length;
		return {
			objects: pages[index],
			cursor: hasNextPage ? `p${index + 1}` : null,
			hasNextPage,
		};
	};
	return { fetchNodePage, calls: () => calls };
}

const notCoin = (object: string) =>
	!object.startsWith('coin');

describe('fillPage', () => {
	test('pages through every kept object once, a page resuming inside a node page', async () => {
		const { fetchNodePage } = node([
			['a', 'coin1', 'b', 'c'],
			['coin2', 'd', 'e'],
		]);
		const pages: string[][] = [];
		const starts: PageStart[] = [];
		let start: PageStart | null = FIRST_PAGE;
		while (start) {
			starts.push(start);
			const page = await fillPage({
				start,
				size: 2,
				keep: notCoin,
				fetchNodePage,
			});
			pages.push(page.rows);
			start = page.next;
		}
		expect(pages).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
		// The second page starts at `c`, the fourth object of the first
		// node page.
		expect(starts[1]).toEqual({ cursor: null, skip: 3 });
	});

	test('stops after the call cap, and the next page carries on', async () => {
		const coins = Array.from(
			{ length: 50 },
			(_, i) => `coin${i}`,
		);
		const { fetchNodePage, calls } = node(
			Array.from({ length: 30 }, () => coins),
		);
		const page = await fillPage({
			start: FIRST_PAGE,
			size: 20,
			keep: notCoin,
			fetchNodePage,
			maxCalls: 10,
		});
		expect(calls()).toBe(10);
		expect(page).toEqual({
			rows: [],
			next: { cursor: 'p10', skip: 0 },
		});
	});
});
