// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The rules of Change signers, free of React: the editor's rows, what
// blocks Review, the differences, and what the proposal carries.
import {
	proofWeight,
	type Composition,
} from '@mysten/sagat';
import type { AccountMember } from '@mysten/sagat/v1';

import { content } from '../content';
import {
	checkSigners,
	invitedName,
	joinList,
	thresholdWarning,
	type FailedLookup,
	type SignerDraft,
	type SignersCheck,
} from './create-multisig';
import {
	sameAddress,
	validatePublicKey,
} from './sui-utils';
import { sumWeight } from './threshold';
import { extractPublicKeyFromBase64 } from './wallet';

const COPY = content.changeSigners;

/** A row of the editor: a current member (`was`) or a new signer. */
export interface ChangeRow extends SignerDraft {
	was?: AccountMember;
	removed?: boolean;
}

/** The signer set being edited. */
export interface CurrentSet {
	address: string;
	threshold: number;
	members: AccountMember[];
}

/** What a Members entry point opens the editor with. */
export type ChangeIntent =
	| { kind: 'add' }
	| { kind: 'remove' | 'replace'; publicKey: string };

export const changeSignersPath = (address: string) =>
	`/multisig/${address}/signers/change`;

export const newRow = (n: number): ChangeRow => ({
	id: `new-${n}`,
	label: '',
	key: '',
	weight: 1,
});

/** Every key comparison goes through this: the form the composition note writes, or the trimmed text when it isn't a key. */
export function suiKey(key: string) {
	try {
		return extractPublicKeyFromBase64(
			key.trim(),
		).toSuiPublicKey();
	} catch {
		return key.trim();
	}
}

export const isReplaced = (row: ChangeRow) =>
	!!row.was &&
	suiKey(row.key) !== suiKey(row.was.publicKey);

const memberName = (row: ChangeRow) =>
	invitedName({
		...row,
		label: row.was?.label ?? '',
		key: row.was?.publicKey ?? '',
	});

/** A row's name in copy: the member it was, unless its key was replaced. */
export const rowName = (row: ChangeRow) =>
	row.was && (row.removed || !isReplaced(row))
		? memberName(row)
		: invitedName(row);

export type RowChip = 'new' | 'removed' | 'replaced';

export function rowChip(row: ChangeRow): RowChip | null {
	if (row.removed) return 'removed';
	if (!row.was) return 'new';
	return isReplaced(row) ? 'replaced' : null;
}

/** The current set as rows, with a Members entry point applied; `focusId` is the row to focus. */
export function startRows(
	current: CurrentSet,
	viewer: string | undefined,
	intent?: ChangeIntent | null,
): { rows: ChangeRow[]; focusId: string | null } {
	let focusId: string | null = null;
	const rows = [...current.members]
		.sort((a, b) => a.order - b.order)
		.map((member, i): ChangeRow => {
			const { address } = validatePublicKey(
				member.publicKey,
			);
			const row: ChangeRow = {
				id: `signer-${i}`,
				label: member.label ?? '',
				key: member.publicKey,
				weight: member.weight,
				isCreator:
					!!address &&
					!!viewer &&
					sameAddress(address, viewer),
				was: member,
			};
			// The viewer stays: their own row takes no intent.
			if (
				intent?.kind !== 'add' &&
				intent?.publicKey === member.publicKey &&
				!row.isCreator
			) {
				if (intent.kind === 'remove') row.removed = true;
				else {
					row.key = '';
					focusId = row.id;
				}
			}
			return row;
		});
	if (intent?.kind === 'add') {
		rows.push(newRow(0));
		focusId = 'new-0';
	}
	return { rows, focusId };
}

export interface ChangeCheck {
	/** The create wizard's check of the rows that stay, in their order. */
	signers: SignersCheck;
	/** Blocks Review: the threshold can't be met. */
	error: string | null;
	warning: string | null;
	canReview: boolean;
}

export function checkChange({
	current,
	rows,
	threshold,
	lookups,
}: {
	current: CurrentSet;
	rows: ChangeRow[];
	threshold: number;
	lookups: Record<string, FailedLookup>;
}): ChangeCheck {
	const kept = rows.filter((row) => !row.removed);
	const signers = checkSigners({
		signers: kept,
		threshold,
		lookups,
		positions: rows.flatMap((row, i) =>
			row.removed ? [] : [i + 1],
		),
	});
	const { totalWeight, address } = signers;
	const removed = rows.flatMap((row) =>
		row.removed ? [rowName(row)] : [],
	);

	// Kept rows count with a key still being typed.
	const keptWeight = sumWeight(kept);
	let error: string | null = null;
	if (threshold > keptWeight)
		error = COPY.unreachable(
			threshold,
			keptWeight,
			removed.length > 0 ? joinList(removed, 'or') : null,
		);
	else if (address) {
		const entry = (
			set: Pick<CurrentSet, 'address' | 'threshold'>,
			members: { publicKey: string; weight: number }[],
		) => ({
			type: 'signer_set' as const,
			version: 1 as const,
			...set,
			members: members.map((m) => ({
				publicKey: suiKey(m.publicKey),
				weight: m.weight,
			})),
		});
		const weight = proofWeight(
			entry(
				{ address, threshold },
				kept.map((row) => ({
					publicKey: row.key,
					weight: row.weight,
				})),
			),
			current.members
				.filter((m) => m.answer === 'accepted')
				.map((m) => suiKey(m.publicKey)),
		);
		if (weight < threshold)
			error = COPY.stayingShort(threshold, weight);
	}
	const complete = kept.filter(
		(_, i) => signers.signers[i].complete,
	);
	return {
		signers,
		error,
		warning:
			error || signers.tooFewSigners
				? null
				: thresholdWarning({
						signers: complete.map((row) => ({
							name: rowName(row),
							weight: row.weight,
							you: row.isCreator && !row.label.trim(),
						})),
						threshold,
						totalWeight,
					}),
		canReview:
			signers.canContinue &&
			!error &&
			!!address &&
			!sameAddress(address, current.address),
	};
}

/** The edited set: the rows that stay, in order. */
export function newComposition(
	rows: ChangeRow[],
	threshold: number,
): Composition {
	return {
		threshold,
		members: rows
			.filter((row) => !row.removed)
			.map((row) => ({
				publicKey: suiKey(row.key),
				weight: row.weight,
			})),
	};
}

export type ChangeKind =
	| 'add'
	| 'remove'
	| 'replace'
	| 'weight'
	| 'threshold'
	| 'reorder';

export interface Difference {
	kind: ChangeKind;
	text: string;
	/** An add's signer, for the title. */
	name?: string;
}

/** Adds, removes, replacements, weights, threshold, reorder. */
export function differences(
	current: CurrentSet,
	rows: ChangeRow[],
	threshold: number,
): Difference[] {
	const kept = rows.filter((row) => !row.removed);
	const was = kept.filter((row) => row.was);
	const list: Difference[] = [
		...kept
			.filter((row) => !row.was)
			.map((row) => ({
				kind: 'add' as const,
				text: COPY.change.add(rowName(row), row.weight),
				name: rowName(row),
			})),
		...rows
			.filter((row) => row.removed && row.was)
			.map((row) => ({
				kind: 'remove' as const,
				text: COPY.change.remove(rowName(row)),
			})),
		...was.filter(isReplaced).map((row) => ({
			kind: 'replace' as const,
			text: COPY.change.replace(memberName(row)),
		})),
		...was
			.filter((row) => row.weight !== row.was!.weight)
			.map((row) => ({
				kind: 'weight' as const,
				text: COPY.change.weight(
					memberName(row),
					row.was!.weight,
					row.weight,
				),
			})),
	];
	if (threshold !== current.threshold)
		list.push({
			kind: 'threshold',
			text: COPY.change.threshold(
				content.common.thresholdLabel(
					current.threshold,
					sumWeight(current.members),
				),
				content.common.thresholdLabel(
					threshold,
					sumWeight(kept),
				),
			),
		});
	const reorder = reorderLine(current, kept);
	if (reorder)
		list.push({ kind: 'reorder', text: reorder });
	return list;
}

// Null unless the signers who stay change their relative order.
function reorderLine(
	current: CurrentSet,
	kept: ChangeRow[],
): string | null {
	const staying = kept.filter(
		(row) => row.was && !isReplaced(row),
	);
	const keys = new Set(
		staying.map((row) => suiKey(row.key)),
	);
	const before = [...current.members]
		.sort((a, b) => a.order - b.order)
		.map((m) => suiKey(m.publicKey));
	const oldOrder = before.filter((key) => keys.has(key));
	const newOrder = staying.map((row) => suiKey(row.key));
	if (oldOrder.join() === newOrder.join()) return null;
	const without = (list: string[], key: string) =>
		list.filter((k) => k !== key).join();
	const mover = staying.find(
		(row) =>
			without(oldOrder, suiKey(row.key)) ===
			without(newOrder, suiKey(row.key)),
	);
	return mover
		? COPY.change.moves(
				rowName(mover),
				before.indexOf(suiKey(mover.key)) + 1,
				kept.indexOf(mover) + 1,
			)
		: COPY.change.reorder;
}

/** "Add Priya", or "Add Priya and 3 more". */
export function changeTitle([
	first,
	...rest
]: Difference[]) {
	if (!first) return '';
	const title = first.name
		? COPY.change.addTitle(first.name)
		: first.text;
	return rest.length > 0
		? COPY.change.more(title, rest.length)
		: title;
}

/** The typed name of each key new to the set, aligned with the new set; undefined when there is none or the set is already an alias. */
export function changeLabels({
	current,
	rows,
	aliases,
	newSet,
}: {
	current: CurrentSet;
	rows: ChangeRow[];
	aliases: readonly string[];
	newSet: string;
}): (string | null)[] | undefined {
	const oldKeys = new Set(
		current.members.map((m) => suiKey(m.publicKey)),
	);
	const labels = rows
		.filter((row) => !row.removed)
		.map((row) =>
			oldKeys.has(suiKey(row.key))
				? null
				: row.label.trim() || null,
		);
	return labels.some((label) => label !== null) &&
		!aliases.some((alias) => sameAddress(alias, newSet))
		? labels
		: undefined;
}
