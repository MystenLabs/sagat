// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { AccountMember } from '@mysten/sagat/v1';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { formatAddress } from '@mysten/sui/utils';
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';
import { describe, expect, test } from 'vitest';

import { content } from '../src/content';
import {
	changeDifferences,
	changeLabels,
	changeTitle,
	checkChange,
	compositionDifferences,
	newComposition,
	newRow,
	removedBy,
	rowDifferences,
	signerChangeIn,
	startRows,
	thresholdSummary,
	type ChangeRow,
	type CurrentSet,
} from '../src/lib/change-signers';
import { checkedChange } from '../src/lib/proposal-page';
import { computeMultisigAddress } from '../src/lib/sui-utils';
import {
	digestOf,
	signerChange,
	transfer,
} from './transactions';

const COPY = content.changeSigners;

const newKey = () => new Ed25519Keypair().getPublicKey();
const addressOf = (publicKey: string) =>
	publicKeyFromSuiBytes(publicKey).toSuiAddress();

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
	signerSets = [current.address],
) =>
	checkChange({
		current,
		rows,
		threshold,
		lookups: {},
		signerSets,
	});

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

	test('a threshold the accepted signers who stay can’t reach alone passes when the new set can', () => {
		// Alice (weight 1) hasn't accepted; Priya is new.
		const current = currentSet([1, 1, 1], 2, [2]);
		const rows = [...rowsOf(current), added(3)];
		expect(check(current, rows, 2).canReview).toBe(true);
		expect(check(current, rows, 3)).toMatchObject({
			canReview: true,
			error: null,
		});
	});

	test('an edited set equal to another of the pod’s signer sets is refused; one that differs by a weight is not', () => {
		const current = currentSet([1, 1, 1], 2);
		const rows = rowsOf(current);
		// The pod's other set: the same signers at 3 of 3.
		const other = computeMultisigAddress(
			current.members.map((m) => m.publicKey),
			[1, 1, 1],
			3,
		).address!;
		const signerSets = [current.address, other];
		expect(
			check(current, rows, 3, signerSets),
		).toMatchObject({
			canReview: false,
			error: COPY.alreadySignerSet,
		});
		const heavier = rows.map((row, i) =>
			i === 2 ? { ...row, weight: 2 } : row,
		);
		expect(
			check(current, heavier, 3, signerSets),
		).toMatchObject({ canReview: true, error: null });
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
		const list = rowDifferences(
			current,
			// At another weight than Hana's, Priya doesn't replace her.
			[...rows, added(2)],
			5,
		);
		expect(list.map((d) => d.text)).toEqual([
			COPY.change.add('Priya', 2),
			COPY.change.remove('Hana', 1),
			COPY.change.weight('Alice', 1, 2),
			COPY.change.threshold('4 of 7', '5 of 9'),
		]);
		expect(list[1].address).toBe(
			addressOf(current.members[4].publicKey),
		);
		expect(changeTitle(list)).toBe(
			COPY.change.more(COPY.change.addTitle('Priya'), 3),
		);
		expect(changeTitle(list.slice(0, 2))).toBe(
			COPY.change.two(
				COPY.change.addTitle('Priya'),
				COPY.change.removeTitle('Hana'),
			),
		);
	});

	test('a replaced key reads as one Replace line, and one signer moving reads as that signer’s move', () => {
		const current = currentSet([1, 1, 1, 1], 2);
		const [maya, daniel, alice, tomas] = rowsOf(current);
		const key = newKey().toSuiPublicKey();
		const replaced = rowDifferences(
			current,
			[maya, { ...daniel, key }, alice, tomas],
			2,
		);
		expect(replaced).toMatchObject([
			{
				text: COPY.change.replace('Daniel', 1),
				address: addressOf(daniel.key),
				newAddress: addressOf(key),
			},
		]);
		expect(changeTitle(replaced)).toBe(
			COPY.change.replaceTitle('Daniel'),
		);
		const moved = rowDifferences(
			current,
			[maya, alice, daniel, tomas],
			2,
		);
		expect(moved.map((d) => d.text)).toEqual([
			COPY.change.moves('Alice', 3, 2),
		]);
		// A reorder is always titled Reorder signers.
		expect(changeTitle(moved)).toBe(COPY.change.reorder);
	});

	test('a replaced signer’s key on a new row stays, so the replaced row’s new key is an add', () => {
		const current = currentSet([1, 1, 1], 2);
		const [maya, daniel, alice] = rowsOf(current);
		const key = newKey().toSuiPublicKey();
		expect(
			rowDifferences(
				current,
				[
					maya,
					{ ...daniel, key },
					alice,
					{ ...added(), key: daniel.key },
				],
				2,
			).map((d) => [d.kind, d.address]),
		).toEqual([
			['add', addressOf(key)],
			['reorder', undefined],
		]);
	});

	test('a key leaving and a key joining at the same place with the same weight read as one Replace line; with a second key leaving beside it, as Add and Remove lines', () => {
		const [maya, daniel, alice, priya] = [0, 1, 2, 3].map(
			() => newKey().toSuiPublicKey(),
		);
		const names = new Map([
			[maya, 'Maya'],
			[daniel, 'Daniel'],
			[alice, 'Alice'],
			[priya, 'Priya'],
		]);
		const lines = (before: string[], after: string[]) =>
			compositionDifferences(
				{
					threshold: 1,
					members: before.map((publicKey) => ({
						publicKey,
						weight: 1,
					})),
				},
				{
					threshold: 1,
					members: after.map((publicKey) => ({
						publicKey,
						weight: 1,
					})),
				},
				(key) => names.get(key)!,
			).map((d) => d.text);
		expect(
			lines([maya, daniel, alice], [maya, priya, alice]),
		).toEqual([COPY.change.replace('Daniel', 1)]);
		expect(
			lines([maya, daniel, alice], [maya, priya]),
		).toEqual([
			COPY.change.add('Priya', 1),
			COPY.change.remove('Daniel', 1),
			COPY.change.remove('Alice', 1),
		]);
	});

	test('a new total under the same threshold reads as a summary line, not a difference; no line when the total stays or the threshold changes', () => {
		const current = currentSet([1, 1, 1], 2);
		const rows = rowsOf(current);
		const removed = rows.map((row, i) =>
			i === 2 ? { ...row, removed: true } : row,
		);
		const summary = (
			next: ChangeRow[],
			threshold: number,
		) =>
			thresholdSummary(
				current,
				newComposition(next, threshold),
			);
		expect(summary(removed, 2)).toBe(
			COPY.review.thresholdAfter('2 of 2', '2 of 3'),
		);
		const list = rowDifferences(current, removed, 2);
		expect(changeTitle(list)).toBe(
			COPY.change.removeTitle('Alice'),
		);
		const replaced = rows.map((row, i) =>
			i === 2
				? { ...row, key: newKey().toSuiPublicKey() }
				: row,
		);
		expect(summary(replaced, 2)).toBeNull();
		expect(summary(removed, 1)).toBeNull();
	});
});

test('a change’s differences come from its bytes checked against the note’s alias set, name an added key by the proposer’s label but never as a current signer, and mark who it removes', async () => {
	const [maya, daniel, alice, priya] = [0, 1, 2, 3].map(
		() => newKey(),
	);
	const set = (...keys: (typeof maya)[]) => ({
		threshold: 2,
		members: keys.map((key) => ({
			publicKey: key.toSuiPublicKey(),
			weight: 1,
		})),
	});
	const { pod, bytes } = await signerChange(
		set(maya, daniel, alice),
		set(maya, daniel, priya),
	);
	const names = new Map(
		[maya, daniel, alice, priya].map((key, i) => [
			key.toSuiPublicKey(),
			['Maya', 'Daniel', 'Alice', 'Priya'][i],
		]),
	);
	const change = signerChangeIn(bytes, [pod]);
	const list = change
		? changeDifferences(change, (key) => names.get(key)!)
		: null;
	expect(list).toMatchObject([
		{
			text: COPY.change.replace('Alice', 1),
			name: 'Priya',
			address: alice.toSuiAddress(),
			newAddress: priya.toSuiAddress(),
		},
	]);
	expect(
		signerChangeIn(bytes, [maya.toSuiAddress()]),
	).toBeNull();
	// The API's label names the key the bytes add, never one they remove.
	const told = (key: typeof maya, label: string) => ({
		publicKey: key.toSuiPublicKey(),
		label,
	});
	const named = (
		labels: ReturnType<typeof told>[],
		podLabels: Map<string, string | null> = new Map(),
	) =>
		checkedChange(
			{
				transactionBytes: bytes,
				signerChange: { removes: null, adds: null, labels },
			},
			{ kind: 'read', aliases: [pod] },
			podLabels,
			{ pod, digest: digestOf(bytes) },
		)?.list?.map((d) => [d.text, d.name]);
	expect(
		named([told(priya, 'Priya'), told(alice, 'Ally')]),
	).toEqual([
		[
			COPY.change.replace(
				formatAddress(alice.toSuiAddress()),
				1,
			),
			'Priya',
		],
	]);
	// Never a current signer's name.
	expect(
		named(
			[told(priya, 'Alice')],
			new Map([[alice.toSuiAddress(), 'Alice']]),
		)?.[0],
	).toEqual([
		COPY.change.replace('Alice', 1),
		formatAddress(priya.toSuiAddress()),
	]);
	expect(
		[alice, maya].map((key) =>
			removedBy(change, key.toSuiPublicKey()),
		),
	).toEqual([true, false]);
});

test('a proposer’s name for an added key is dropped when it reads as a current signer’s name', async () => {
	const [hana, priya] = [newKey(), newKey()];
	const set = (...keys: (typeof hana)[]) => ({
		threshold: 1,
		members: keys.map((key) => ({
			publicKey: key.toSuiPublicKey(),
			weight: 1,
		})),
	});
	const { pod, bytes } = await signerChange(
		set(hana),
		set(hana, priya),
	);
	const added = (label: string) =>
		checkedChange(
			{
				transactionBytes: bytes,
				signerChange: {
					removes: null,
					adds: null,
					labels: [
						{ publicKey: priya.toSuiPublicKey(), label },
					],
				},
			},
			{ kind: 'read', aliases: [pod] },
			new Map([[hana.toSuiAddress(), 'Hana']]),
			{ pod, digest: digestOf(bytes) },
		)?.list?.[0].text;
	const unnamed = COPY.change.add(
		formatAddress(priya.toSuiAddress()),
		1,
	);
	expect(added('hana')).toBe(unnamed);
	expect(added(' Hana  ')).toBe(unnamed);
	expect(added('Hana K')).toBe(
		COPY.change.add('Hana K', 1),
	);
});

test('a change is checked only as the opened proposal of the pod that sends it', async () => {
	const [maya, daniel] = [newKey(), newKey()];
	const set = (...keys: (typeof maya)[]) => ({
		threshold: 1,
		members: keys.map((key) => ({
			publicKey: key.toSuiPublicKey(),
			weight: 1,
		})),
	});
	const { pod, bytes } = await signerChange(
		set(maya),
		set(maya, daniel),
	);
	const checked = (opened: {
		pod: string;
		digest: string;
	}) =>
		checkedChange(
			{ transactionBytes: bytes, signerChange: null },
			{ kind: 'read', aliases: [pod] },
			new Map(),
			opened,
		);
	const digest = digestOf(bytes);
	expect(checked({ pod, digest })).not.toBeNull();
	expect(
		checked({ pod: maya.toSuiAddress(), digest }),
	).toBeNull();
	expect(
		checked({
			pod,
			digest: digestOf(await transfer(undefined, pod)),
		}),
	).toBeNull();
});

test('labels are the typed names of keys new to the set, and null for keys that stay', () => {
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
	expect(changeLabels({ current, rows })).toEqual([
		null,
		'Priya',
		'Dan',
	]);
});
