// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { AccountMember } from '@mysten/sagat/v1';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, test } from 'vitest';

import { content } from '../src/content';
import {
	changeLabels,
	changeTitle,
	checkChange,
	differences,
	newComposition,
	newRow,
	startRows,
	type ChangeRow,
	type CurrentSet,
} from '../src/lib/change-signers';
import { computeMultisigAddress } from '../src/lib/sui-utils';

const COPY = content.changeSigners;

const newKey = () => new Ed25519Keypair().getPublicKey();

/** A set of `weights`, one named member per weight, every one accepted unless listed. */
function currentSet(
	weights: number[],
	threshold: number,
	invited: number[] = [],
): CurrentSet & { viewer: string } {
	const keys = weights.map(() => newKey());
	const members: AccountMember[] = keys.map(
		(key, order) => ({
			publicKey: key.toSuiPublicKey(),
			weight: weights[order],
			order,
			answer: invited.includes(order)
				? 'invited'
				: 'accepted',
			label:
				['Maya', 'Daniel', 'Alice', 'Tomás', 'Hana'][
					order
				] ?? null,
		}),
	);
	return {
		address: computeMultisigAddress(
			members.map((m) => m.publicKey),
			weights,
			threshold,
		).address!,
		threshold,
		members,
		viewer: keys[0].toSuiAddress(),
	};
}

const check = (
	current: CurrentSet,
	rows: ChangeRow[],
	threshold = current.threshold,
) => checkChange({ current, rows, threshold, lookups: {} });

const rowsOf = (current: CurrentSet & { viewer: string }) =>
	startRows(current, current.viewer).rows;

const added = (weight = 1, label = 'Priya'): ChangeRow => ({
	...newRow(1),
	label,
	key: newKey().toSuiPublicKey(),
	weight,
});

describe('what blocks Review', () => {
	test('nothing that differs is refused; one difference is not', () => {
		const current = currentSet([1, 1, 1], 2);
		const rows = rowsOf(current);
		expect(check(current, rows).canReview).toBe(false);
		expect(check(current, rows, 3).canReview).toBe(true);
	});

	test('2 and 10 signers are the limits', () => {
		const current = currentSet([1, 1, 1], 2);
		const rows = rowsOf(current);
		const removed = (n: number) =>
			rows.map((row, i) =>
				i >= 3 - n ? { ...row, removed: true } : row,
			);
		expect(check(current, removed(1), 2).canReview).toBe(
			true,
		);
		expect(check(current, removed(2), 1).canReview).toBe(
			false,
		);

		const grown = (count: number) => [
			...rows,
			...Array.from({ length: count - 3 }, () => added()),
		];
		expect(check(current, grown(10)).canReview).toBe(true);
		expect(check(current, grown(11)).canReview).toBe(false);
	});

	test('a threshold equal to the total passes; one above it is refused and names who to keep', () => {
		const current = currentSet([2, 2, 1], 3);
		const rows = rowsOf(current).map((row, i) =>
			i === 1 ? { ...row, removed: true } : row,
		);
		expect(check(current, rows, 3).canReview).toBe(true);
		expect(check(current, rows, 4)).toMatchObject({
			canReview: false,
			error: COPY.unreachable(4, 3, 'Daniel'),
		});
	});

	test('Replace from Members on a 2-of-2 pod opens with no threshold error', () => {
		const current = currentSet([1, 1], 2);
		const { rows } = startRows(current, current.viewer, {
			kind: 'replace',
			publicKey: current.members[1].publicKey,
		});
		expect(check(current, rows).error).toBeNull();
	});

	test('the signers who stay and have accepted must meet the new threshold; a staying signer still invited doesn’t count', () => {
		// Alice (weight 1) hasn't accepted; Priya is new.
		const current = currentSet([1, 1, 1], 2, [2]);
		const rows = [...rowsOf(current), added(3)];
		expect(check(current, rows, 2).canReview).toBe(true);
		expect(check(current, rows, 3)).toMatchObject({
			canReview: false,
			error: COPY.stayingShort(3, 2),
		});
	});

	test('one signer who can meet the threshold alone warns and doesn’t block', () => {
		const current = currentSet([2, 2, 1], 4);
		const result = check(current, rowsOf(current), 2);
		expect(result.warning).toBe(
			content.createMultisig.aloneMany('Maya or Daniel', 2),
		);
		expect(result.canReview).toBe(true);
	});
});

test('Remove from Members marks the row, except the viewer’s own', () => {
	const three = currentSet([1, 1, 1], 2);
	const removing = (current: typeof three, at: number) =>
		startRows(current, current.viewer, {
			kind: 'remove',
			publicKey: current.members[at].publicKey,
		}).rows[at].removed;
	expect(removing(three, 1)).toBe(true);
	expect(removing(three, 0)).toBeFalsy();
});

describe('differences', () => {
	test('adds, removes, weights and the threshold, in that order, and the title', () => {
		const current = currentSet([2, 2, 1, 1, 1], 4);
		const rows = rowsOf(current).map((row, i) =>
			i === 2
				? { ...row, weight: 2 }
				: i === 4
					? { ...row, removed: true }
					: row,
		);
		const list = differences(
			current,
			[...rows, added()],
			5,
		);
		expect(list.map((d) => d.text)).toEqual([
			COPY.change.add('Priya', 1),
			COPY.change.remove('Hana'),
			COPY.change.weight('Alice', 1, 2),
			COPY.change.threshold('4 of 7', '5 of 8'),
		]);
		expect(changeTitle(list)).toBe(
			COPY.change.more(COPY.change.addTitle('Priya'), 3),
		);
	});

	test('a replaced key, and one signer moving', () => {
		const current = currentSet([1, 1, 1, 1], 2);
		const [maya, daniel, alice, tomas] = rowsOf(current);
		expect(
			differences(
				current,
				[
					maya,
					{ ...daniel, key: newKey().toSuiPublicKey() },
					alice,
					tomas,
				],
				2,
			).map((d) => d.text),
		).toEqual([COPY.change.replace('Daniel')]);
		expect(
			differences(
				current,
				[maya, alice, daniel, tomas],
				2,
			).map((d) => d.text),
		).toEqual([COPY.change.moves('Alice', 3, 2)]);
	});
});

test('labels name only the keys new to the set, in the new set’s order', () => {
	const current = currentSet([1, 1, 1], 2);
	const [maya, daniel, alice] = rowsOf(current);
	const rows = [
		maya,
		added(1, 'Priya'),
		{
			...daniel,
			label: 'Dan',
			key: newKey().toSuiPublicKey(),
		},
		{ ...alice, removed: true },
	];
	const newSet = computeMultisigAddress(
		newComposition(rows, 2).members.map((m) => m.publicKey),
		[1, 1, 1],
		2,
	).address!;
	expect(
		changeLabels({
			current,
			rows,
			aliases: [current.address],
			newSet,
		}),
	).toEqual([null, 'Priya', 'Dan']);
	expect(
		changeLabels({
			current,
			rows,
			aliases: [current.address, newSet],
			newSet,
		}),
	).toBeUndefined();
});
