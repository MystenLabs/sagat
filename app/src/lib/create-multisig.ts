// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The rules of the create-multisig wizard, kept free of React so the copy
// and the limits are in one place: which signer rows are complete, what
// blocks Continue, which warnings show, and the address preview.
import { formatAddress } from '@mysten/sui/utils';

import { CONFIG, VALIDATION } from './constants';
import {
	computeMultisigAddress,
	validatePublicKey,
} from './sui-utils';

/** A row in the signers table, as the creator typed it. */
export interface SignerDraft {
	id: string;
	/** The per-key label sent to the API. Optional. */
	label: string;
	/** A public key, or a 0x address to look the key up from. */
	key: string;
	weight: number;
	/** The connected wallet: read-only key and name, can't be removed. */
	isCreator?: boolean;
}

/** An address whose public key couldn't be found. */
export type FailedLookup =
	{ kind: 'missing' } | { kind: 'error'; message: string };

export type SignerStatus =
	/** Nothing typed yet: no status line. */
	| { kind: 'blank' }
	| { kind: 'valid'; address: string }
	| { kind: 'looking-up' }
	/** An address with no key on record: a warning, not an error. */
	| { kind: 'no-key'; message: string }
	| { kind: 'error'; message: string };

export interface SignerCheck {
	status: SignerStatus;
	/** What copy calls the signer: its label, or "Signer N". */
	name: string;
	labelLength: number;
	labelTooLong: boolean;
	/** Counts towards the signers and the total weight. */
	complete: boolean;
}

const SUI_ADDRESS = /^0x[0-9a-fA-F]{64}$/;

/** A full 0x address pasted into the key field, normalized; else null. */
export function addressInput(key: string): string | null {
	const trimmed = key.trim();
	return SUI_ADDRESS.test(trimmed)
		? trimmed.toLowerCase()
		: null;
}

/** Characters as the API counts them: code points, after trimming. */
export function textLength(value: string) {
	return [...value.normalize('NFC').trim()].length;
}

export function clamp(
	value: number,
	min: number,
	max: number,
) {
	return Math.min(Math.max(value, min), max);
}

/** "a", "a and b", "a, b and c". */
export function joinList(
	items: string[],
	conjunction: 'and' | 'or',
) {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

export const NAME_MAX = VALIDATION.MAX_MULTISIG_NAME_LENGTH;

/** The step 1 error for a name, or null when it is fine. */
export function nameError(name: string): string | null {
	const length = textLength(name);
	if (length === 0) return 'Give the multisig a name.';
	if (length > NAME_MAX)
		return `${length} of ${NAME_MAX} characters. Use ${NAME_MAX} or fewer.`;
	return null;
}

export const COPY = {
	invalidKey:
		'This isn’t a valid Sui public key. Check that you copied the whole key.',
	duplicateKey: (other: string) =>
		`${other} already uses this key. Each signer needs their own key.`,
	noKey: (label: string) =>
		`No public key found for this address. It hasn’t signed a transaction yet. ${
			label
				? `Ask ${label} for their public key.`
				: 'Ask them for their public key.'
		}`,
	tooFewSigners:
		'Add at least one more signer. A multisig needs 2 or more.',
	everyoneMustSign:
		'Every signer must sign every proposal. If one signer loses their key, the multisig can’t move funds.',
	emptyAddress:
		'Appears once you add signers and set a threshold.',
};

export interface SignersCheck {
	signers: SignerCheck[];
	completeCount: number;
	incompleteCount: number;
	/** Sum of the complete signers' weights. */
	totalWeight: number;
	tooFewSigners: boolean;
	/** Left of the disabled Continue; null when nothing is blocking. */
	blockedMessage: string | null;
	/** The dashed address box while rows are incomplete. */
	addressMessage: string | null;
	canContinue: boolean;
	/** One of the threshold warnings; never blocks. */
	warning: string | null;
	address: string | null;
}

export function checkSigners({
	signers,
	threshold,
	lookups,
	creatorName,
}: {
	signers: SignerDraft[];
	threshold: number;
	/** Addresses whose lookup came back empty. */
	lookups: Record<string, FailedLookup>;
	/** The connected wallet's name, if it has one. */
	creatorName: string | null;
}): SignersCheck {
	const nameOf = (signer: SignerDraft, index: number) =>
		signer.label.trim() ||
		(signer.isCreator && creatorName) ||
		`Signer ${index + 1}`;

	// The first row with a key owns it; later rows are duplicates.
	const firstWithKey = new Map<string, number>();

	const checks = signers.map((signer, index) => {
		const name = nameOf(signer, index);
		const labelLength = textLength(signer.label);
		const labelTooLong =
			labelLength > CONFIG.MAX_KEY_LABEL_LENGTH;
		const status = keyStatus(signer, lookups);

		let finalStatus = status;
		if (status.kind === 'valid') {
			const owner = firstWithKey.get(status.address);
			if (owner === undefined)
				firstWithKey.set(status.address, index);
			else {
				// "Daniel (signer 2)", or just "Signer 2" when unnamed.
				const ownerName = nameOf(signers[owner], owner);
				const position = `Signer ${owner + 1}`;
				finalStatus = {
					kind: 'error',
					message: COPY.duplicateKey(
						ownerName === position
							? position
							: `${ownerName} (signer ${owner + 1})`,
					),
				};
			}
		}

		return {
			status: finalStatus,
			name,
			labelLength,
			labelTooLong,
			complete:
				finalStatus.kind === 'valid' && !labelTooLong,
		};
	});

	const complete = checks.filter((c) => c.complete);
	const completeCount = complete.length;
	const incompleteCount = checks.length - completeCount;
	const totalWeight = signers.reduce(
		(sum, signer, i) =>
			checks[i].complete ? sum + signer.weight : sum,
		0,
	);
	const tooFewSigners = signers.length < CONFIG.MIN_MEMBERS;

	// Rows that hold Continue back, by their 1-based position.
	const blocked = checks.flatMap((c, i) =>
		c.complete ? [] : [i + 1],
	);
	let blockedMessage: string | null = null;
	let addressMessage: string | null = null;
	if (blocked.length > 0) {
		const only = checks[blocked[0] - 1];
		if (
			blocked.length === 1 &&
			only.status.kind === 'no-key'
		) {
			blockedMessage = `Add a public key for signer ${blocked[0]}, or remove the row, to continue.`;
			addressMessage = `Add a public key for signer ${blocked[0]}, or remove the row to see the address.`;
		} else {
			const which = `${blocked.length === 1 ? 'signer' : 'signers'} ${joinList(blocked.map(String), 'and')}`;
			blockedMessage = `Finish or remove ${which} to continue.`;
			addressMessage = `Finish or remove ${which} to see the address.`;
		}
	}

	const address =
		blocked.length === 0 && signers.length > 0
			? computeMultisigAddress(
					signers.map((s) => s.key.trim()),
					signers.map((s) => s.weight),
					threshold,
				).address
			: null;

	return {
		signers: checks,
		completeCount,
		incompleteCount,
		totalWeight,
		tooFewSigners,
		blockedMessage: tooFewSigners ? null : blockedMessage,
		addressMessage,
		canContinue:
			!tooFewSigners && blocked.length === 0 && !!address,
		warning: tooFewSigners
			? null
			: thresholdWarning({
					signers: signers.flatMap((s, i) =>
						checks[i].complete
							? [
									{
										name: checks[i].name,
										weight: s.weight,
										you:
											!!s.isCreator &&
											!s.label.trim() &&
											!creatorName,
									},
								]
							: [],
					),
					threshold,
					totalWeight,
				}),
		address,
	};
}

function keyStatus(
	signer: SignerDraft,
	lookups: Record<string, FailedLookup>,
): SignerStatus {
	const key = signer.key.trim();
	if (!key) return { kind: 'blank' };

	const address = addressInput(key);
	if (address) {
		const failed = lookups[address];
		if (!failed) return { kind: 'looking-up' };
		if (failed.kind === 'error')
			return { kind: 'error', message: failed.message };
		return {
			kind: 'no-key',
			message: COPY.noKey(signer.label.trim()),
		};
	}

	const parsed = validatePublicKey(key);
	return parsed.isValid && parsed.address
		? { kind: 'valid', address: parsed.address }
		: { kind: 'error', message: COPY.invalidKey };
}

/**
 * Warns when one signer can approve alone, or when every signer has to
 * sign. `you` marks the creator when their wallet has no name.
 */
export function thresholdWarning({
	signers,
	threshold,
	totalWeight,
}: {
	signers: {
		name: string;
		weight: number;
		you?: boolean;
	}[];
	threshold: number;
	totalWeight: number;
}): string | null {
	const alone = signers.filter(
		(s) => s.weight >= threshold,
	);
	if (alone.length === 1) {
		const [{ name, weight, you }] = alone;
		return you
			? `You can approve proposals alone. Your weight (${weight}) is at or above the threshold (${threshold}). Lower your weight below ${threshold}, or raise the threshold above ${weight}.`
			: `${name} can approve proposals alone. ${name}’s weight (${weight}) is at or above the threshold (${threshold}). Lower ${name}’s weight below ${threshold}, or raise the threshold above ${weight}.`;
	}
	if (alone.length > 1) {
		const highest = Math.max(...alone.map((s) => s.weight));
		const names = alone.map((s) =>
			s.you ? 'You' : s.name,
		);
		return `${joinList(names, 'or')} can approve proposals alone. Raise the threshold to ${highest + 1} or more so every proposal needs at least two signers.`;
	}
	if (totalWeight > 0 && threshold >= totalWeight)
		return COPY.everyoneMustSign;
	return null;
}

/**
 * The threshold bar: one segment per unit of weight up to 10, then a
 * continuous bar whose filled part never shrinks below a visible sliver.
 */
export function thresholdBar(
	threshold: number,
	totalWeight: number,
):
	| { kind: 'segments'; filled: boolean[] }
	| { kind: 'continuous'; percent: number } {
	if (totalWeight <= 10)
		return {
			kind: 'segments',
			filled: Array.from(
				{ length: Math.max(totalWeight, 1) },
				(_, i) => i < threshold,
			),
		};
	const MIN_PERCENT = 4;
	return {
		kind: 'continuous',
		percent:
			threshold >= totalWeight
				? 100
				: Math.max(
						(threshold / totalWeight) * 100,
						MIN_PERCENT,
					),
	};
}

/** What the success banner calls an invited signer. */
export function invitedName(signer: SignerDraft) {
	const label = signer.label.trim();
	if (label) return label;
	const { address } = validatePublicKey(signer.key.trim());
	return address ? formatAddress(address) : 'a signer';
}
