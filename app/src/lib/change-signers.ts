// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The rules of Change signers, free of React: the editor's rows, what
// blocks Review, the differences, and what the proposal carries.
import {
	checkSignerChange,
	readCompositionNote,
	type Composition,
	type SignerChange,
} from '@mysten/sagat';
import type { AccountMember } from '@mysten/sagat/v1';
import { Transaction } from '@mysten/sui/transactions';
import { formatAddress } from '@mysten/sui/utils';

import { content } from '../content';
import {
	checkSigners,
	invitedName,
	joinList,
	type FailedLookup,
	type SignerDraft,
	type SignersCheck,
} from './create-multisig';
import { signerRows } from './signers';
import {
	sameAddress,
	validatePublicKey,
} from './sui-utils';
import { sumWeight } from './threshold';
import { extractPublicKeyFromBase64 } from './wallet';

const COPY = content.changeSigners;
const COMMON = content.common;

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

const memberName = (m: AccountMember) =>
	invitedName({ label: m.label ?? '', key: m.publicKey });

/** A row's name in copy: the member it was, unless its key was replaced. */
export const rowName = (row: ChangeRow) =>
	row.was && (row.removed || !isReplaced(row))
		? memberName(row.was)
		: invitedName(row);

export type RowChip = 'new' | 'removed' | 'replaced';

export function rowChip(row: ChangeRow): RowChip | null {
	if (row.removed) return 'removed';
	if (!row.was) return 'new';
	return isReplaced(row) ? 'replaced' : null;
}

/** Whether the viewer may open the editor: signer changes are enabled for the pod and the viewer signs in `set`. */
export const canChangeSigners = (
	enabled: boolean | undefined,
	set: { members: AccountMember[] } | undefined,
	viewer: string | undefined,
) =>
	!!enabled &&
	!!set &&
	signerRows(set.members, viewer).some((row) => row.isYou);

/** The current set as rows, with a Members entry point applied; `focusId` is the row to focus. */
export function startRows(
	current: CurrentSet,
	viewer: string | undefined,
	intent?: ChangeIntent | null,
): { rows: ChangeRow[]; focusId: string | null } {
	let focusId: string | null = null;
	const rows = signerRows(current.members, viewer).map(
		({ member, isYou }, i): ChangeRow => {
			const row: ChangeRow = {
				id: `signer-${i}`,
				label: member.label ?? '',
				key: member.publicKey,
				weight: member.weight,
				isCreator: isYou,
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
		},
	);
	if (intent?.kind === 'add') {
		rows.push(newRow(0));
		focusId = 'new-0';
	}
	return { rows, focusId };
}

export interface ChangeCheck {
	/** The create wizard's check of the rows that stay, in their order. */
	signers: SignersCheck;
	/** Blocks Review: the threshold can't be met, or the edited set is another of the pod's signer sets. */
	error: string | null;
	warning: string | null;
	canReview: boolean;
}

export function checkChange({
	current,
	rows,
	threshold,
	lookups,
	signerSets,
}: {
	current: CurrentSet;
	rows: ChangeRow[];
	threshold: number;
	lookups: Record<string, FailedLookup>;
	/** The addresses of the pod's signer sets on the network. */
	signerSets: readonly string[];
}): ChangeCheck {
	const kept = rows.filter((row) => !row.removed);
	const signers = checkSigners({
		signers: kept,
		threshold,
		lookups,
		positions: rows.flatMap((row, i) =>
			row.removed ? [] : [i + 1],
		),
		warningName: (row) => ({
			name: rowName(row),
			you: !!row.isCreator && !row.label.trim(),
		}),
	});
	const { address } = signers;
	const removed = rows.flatMap((row) =>
		row.removed ? [rowName(row)] : [],
	);

	// Kept rows count with a key still being typed.
	const keptWeight = sumWeight(kept);
	const error =
		threshold > keptWeight
			? COPY.unreachable(
					threshold,
					keptWeight,
					removed.length > 0
						? joinList(removed, 'or')
						: null,
				)
			: address &&
				  !sameAddress(address, current.address) &&
				  signerSets.some((set) =>
						sameAddress(set, address),
				  )
				? COPY.alreadySignerSet
				: null;
	return {
		signers,
		error,
		warning: error ? null : signers.warning,
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
	/** An add's, remove's or replace's short form, for the proposal's title. */
	title?: string;
	/** The name of the key an add or replace brings in, for the invitation line. */
	name?: string;
	/** The Sui address of the key an add, remove or replace names. */
	address?: string;
	/** A replace's new key's Sui address. */
	newAddress?: string;
	/** The key of the signer the line names. */
	publicKey?: string;
	/** A replace's new key. */
	newKey?: string;
}

interface Member {
	publicKey: string;
	weight: number;
	name: string;
}

const addressOf = (publicKey: string) =>
	validatePublicKey(publicKey).address ?? undefined;

/** One side of a change, in order. */
interface ChangeSide {
	threshold: number;
	members: Member[];
}

// Each run of consecutive keys that don't stay, under the staying key just before it (null at the start).
function runs(members: Member[], stays: Set<string>) {
	const out = new Map<string | null, Member[]>();
	let at: string | null = null;
	for (const m of members) {
		if (stays.has(m.publicKey)) at = m.publicKey;
		else out.set(at, [...(out.get(at) ?? []), m]);
	}
	return out;
}

/** Adds, removes, replacements, weights, threshold, reorder. A key leaving and a key joining alone at the same place, at the same weight, read as one replace. */
function differences(
	before: ChangeSide,
	after: ChangeSide,
): Difference[] {
	const kept = after.members.flatMap((m) => {
		const b = before.members.find(
			(b) => b.publicKey === m.publicKey,
		);
		return b ? [{ m, b }] : [];
	});
	const stays = new Set(kept.map(({ m }) => m.publicKey));
	const joining = runs(after.members, stays);
	const replaced = [...runs(before.members, stays)].flatMap(
		([at, leaving]) => {
			const joined = joining.get(at) ?? [];
			return leaving.length === 1 &&
				joined.length === 1 &&
				leaving[0].weight === joined[0].weight
				? [{ m: joined[0], b: leaving[0] }]
				: [];
		},
	);
	const paired = new Set(
		replaced.flatMap(({ m, b }) => [m, b]),
	);
	const alone = (m: Member) =>
		!stays.has(m.publicKey) && !paired.has(m);
	const list: Difference[] = [
		...after.members.filter(alone).map((m) => ({
			kind: 'add' as const,
			text: COPY.change.add(m.name, m.weight),
			title: COPY.change.addTitle(m.name),
			name: m.name,
			address: addressOf(m.publicKey),
			publicKey: m.publicKey,
		})),
		...before.members.filter(alone).map((b) => ({
			kind: 'remove' as const,
			text: COPY.change.remove(b.name, b.weight),
			title: COPY.change.removeTitle(b.name),
			address: addressOf(b.publicKey),
			publicKey: b.publicKey,
		})),
		...replaced.map(({ m, b }) => ({
			kind: 'replace' as const,
			text: COPY.change.replace(b.name, b.weight),
			title: COPY.change.replaceTitle(b.name),
			name: m.name,
			address: addressOf(b.publicKey),
			newAddress: addressOf(m.publicKey),
			publicKey: b.publicKey,
			newKey: m.publicKey,
		})),
		...kept
			.filter(({ m, b }) => m.weight !== b.weight)
			.map(({ m, b }) => ({
				kind: 'weight' as const,
				text: COPY.change.weight(
					b.name,
					b.weight,
					m.weight,
				),
				publicKey: b.publicKey,
			})),
	];
	if (after.threshold !== before.threshold)
		list.push({
			kind: 'threshold',
			text: COPY.change.threshold(
				COMMON.thresholdLabel(
					before.threshold,
					sumWeight(before.members),
				),
				COMMON.thresholdLabel(
					after.threshold,
					sumWeight(after.members),
				),
			),
		});
	const reorder = reorderLine(
		before.members.map((b) => b.publicKey),
		after.members,
		kept,
	);
	if (reorder)
		list.push({ kind: 'reorder', text: reorder });
	return list;
}

// Null unless the signers who stay change their relative order.
function reorderLine(
	oldKeys: string[],
	after: Member[],
	staying: { m: Member; b: Member }[],
): string | null {
	const keys = new Set(staying.map(({ m }) => m.publicKey));
	const oldOrder = oldKeys.filter((key) => keys.has(key));
	const newOrder = staying.map(({ m }) => m.publicKey);
	if (oldOrder.join() === newOrder.join()) return null;
	const without = (list: string[], key: string) =>
		list.filter((k) => k !== key).join();
	const mover = staying.find(
		({ m }) =>
			without(oldOrder, m.publicKey) ===
			without(newOrder, m.publicKey),
	);
	return mover
		? COPY.change.moves(
				mover.b.name,
				oldKeys.indexOf(mover.m.publicKey) + 1,
				after.indexOf(mover.m) + 1,
			)
		: COPY.change.reorder;
}

/** "Threshold after this change: 2 of 2 (was 2 of 3)" when the total weight changes and the threshold doesn't; null otherwise, as the threshold's own difference says it. */
export function thresholdSummary(
	before: Pick<Composition, 'threshold' | 'members'>,
	after: Pick<Composition, 'threshold' | 'members'>,
): string | null {
	const [was, now] = [before, after].map((set) =>
		sumWeight([...set.members]),
	);
	return after.threshold === before.threshold && now !== was
		? COPY.review.thresholdAfter(
				COMMON.thresholdLabel(after.threshold, now),
				COMMON.thresholdLabel(before.threshold, was),
			)
		: null;
}

type Side = Pick<Composition, 'threshold' | 'members'>;

/** A change's differences, from the set it replaces and the set it puts in place, every key named by `nameOf`. */
export function compositionDifferences(
	before: Side,
	after: Side,
	nameOf: (publicKey: string) => string,
): Difference[] {
	const side = (set: Side): ChangeSide => ({
		threshold: set.threshold,
		members: set.members.map((m) => ({
			publicKey: m.publicKey,
			weight: m.weight,
			name: nameOf(m.publicKey),
		})),
	});
	return differences(side(before), side(after));
}

/** The editor's differences: the current set before, the set the proposal carries after. */
export function rowDifferences(
	current: CurrentSet,
	rows: ChangeRow[],
	threshold: number,
): Difference[] {
	const members = [...current.members].sort(
		(a, b) => a.order - b.order,
	);
	const names = new Map([
		...rows.map(
			(row) => [suiKey(row.key), invitedName(row)] as const,
		),
		...members.map(
			(m) => [suiKey(m.publicKey), memberName(m)] as const,
		),
	]);
	return compositionDifferences(
		{
			threshold: current.threshold,
			members: members.map((m) => ({
				publicKey: suiKey(m.publicKey),
				weight: m.weight,
			})),
		},
		newComposition(rows, threshold),
		(key) => names.get(key) ?? key,
	);
}

/** A row's chip after the change, from the differences: `new` for a key an add brings in, `replaced` for a replace's new key. */
export function reviewChip(
	row: ChangeRow,
	list: Difference[],
): RowChip | null {
	const key = suiKey(row.key);
	if (
		list.some(
			(d) => d.kind === 'add' && d.publicKey === key,
		)
	)
		return 'new';
	return list.some(
		(d) => d.kind === 'replace' && d.newKey === key,
	)
		? 'replaced'
		: null;
}

/** The bytes' signer change, checked against `aliases` (else the note's `before`). */
export function signerChangeIn(
	bytes: string,
	aliases: readonly string[] | null,
): SignerChange | null {
	try {
		const data = Transaction.from(bytes).getData();
		const before =
			aliases ?? readCompositionNote(data)?.before;
		return before ? checkSignerChange(data, before) : null;
	} catch {
		return null;
	}
}

/** A checked change's differences. */
export function changeDifferences(
	change: SignerChange,
	nameOf: (publicKey: string) => string,
): Difference[] {
	return compositionDifferences(
		change.oldSet,
		change.newSet,
		nameOf,
	);
}

// A change as a title: an add, remove or replace without its weight, a reorder without who moves.
const titleOf = (d: Difference) =>
	d.title ??
	(d.kind === 'reorder' ? COPY.change.reorder : d.text);

/** "Remove Hana", "Add Priya and remove Hana", or "Add Priya and 3 more". */
export function changeTitle(list: Difference[]) {
	const [first, second] = list.map(titleOf);
	if (list.length < 2) return first ?? '';
	return list.length === 2
		? COPY.change.two(first, second)
		: COPY.change.more(first, list.length - 1);
}

/** A replace's new key's name, shown with its "New" address; null when it is only the short address. */
export const newKeyName = ({
	name,
	newAddress,
}: Difference) =>
	name && newAddress && name !== formatAddress(newAddress)
		? name
		: null;

/** Whether `publicKey` is in the change's old set and not in its new set. */
export const removedBy = (
	change: SignerChange | null,
	publicKey: string | null,
) =>
	!!change &&
	change.oldSet.members.some(
		(m) => m.publicKey === publicKey,
	) &&
	!change.newSet.members.some(
		(m) => m.publicKey === publicKey,
	);

/** The typed name of each key new to the set, aligned with the new set; undefined when there is none. */
export function changeLabels({
	current,
	rows,
}: {
	current: CurrentSet;
	rows: ChangeRow[];
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
	return labels.some((label) => label !== null)
		? labels
		: undefined;
}
