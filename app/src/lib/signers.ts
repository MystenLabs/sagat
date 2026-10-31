// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigMember } from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';

import { content } from '../content';
import { memberStatus } from './member-status';
import { validatePublicKey } from './sui-utils';

const COPY = content.signers;

export interface SignerSetStatus {
	total: number;
	accepted: number;
	rejected: number;
	pending: number;
	/**
	 * Whether the signers who haven't rejected (accepted or still invited)
	 * carry enough weight to meet the threshold. False means the account
	 * can never execute a proposal with this set.
	 */
	canReachThreshold: boolean;
	/** The rejected signers' names, in row order. */
	rejectedNames: string[];
}

export interface SignerEntry {
	member: MultisigMember;
	address: string | undefined;
	/** The key's label, else its short address. */
	name: string;
	status: ReturnType<typeof memberStatus>;
	isYou: boolean;
	/** The key that created the account. */
	isCreator: boolean;
}

/**
 * The members in composition order, with what the signer tables need.
 * `creatorAddress` marks the account's creator, when known.
 */
export function signerRows(
	members: MultisigMember[],
	currentAddress: string | null | undefined,
	creatorAddress?: string | null,
): SignerEntry[] {
	return [...members]
		.sort((a, b) => a.order - b.order)
		.map((member) => {
			const address = validatePublicKey(
				member.publicKey,
			).address;
			return {
				member,
				address,
				name:
					member.label ||
					(address
						? formatAddress(address)
						: content.common.unknownKey),
				status: memberStatus(member),
				isYou: !!address && address === currentAddress,
				isCreator: !!address && address === creatorAddress,
			};
		});
}

/**
 * Each member's address and its key's label, or null when unlabelled.
 * Skips members whose key does not parse.
 */
export function memberLabels(
	members: MultisigMember[],
): Map<string, string | null> {
	const labels = new Map<string, string | null>();
	for (const member of members) {
		const { address } = validatePublicKey(member.publicKey);
		if (address) labels.set(address, member.label || null);
	}
	return labels;
}

/**
 * Where the signer set stands, counted by invitation status, from the
 * rows `signerRows` builds.
 */
export function signerSetStatus(
	rows: SignerEntry[],
	threshold: number,
): SignerSetStatus {
	let accepted = 0;
	let reachableWeight = 0;
	const rejectedNames: string[] = [];
	for (const row of rows) {
		if (row.status === 'accepted') accepted += 1;
		if (row.status === 'rejected')
			rejectedNames.push(row.name);
		else reachableWeight += row.member.weight;
	}
	const rejected = rejectedNames.length;
	return {
		total: rows.length,
		accepted,
		rejected,
		pending: rows.length - accepted - rejected,
		canReachThreshold: reachableWeight >= threshold,
		rejectedNames,
	};
}

/**
 * The one-line summary beside the signers heading: "All 5 accepted",
 * "Both accepted", "4 of 5 accepted · Hana rejected", "2 of 5 accepted ·
 * 3 rejected".
 */
export function signerSummary(
	status: SignerSetStatus,
): string {
	const { total, accepted, rejected, rejectedNames } =
		status;
	if (accepted === total)
		return total === 2
			? COPY.summary.bothAccepted
			: COPY.summary.allAccepted(total);
	const head = COPY.summary.accepted(accepted, total);
	if (rejected === 0) return head;
	const tail =
		rejected === 1
			? COPY.summary.oneRejected(rejectedNames[0])
			: COPY.summary.manyRejected(rejected);
	return `${head} · ${tail}`;
}

/**
 * The banner over the signers when someone rejected: a warning while the
 * others can still reach the threshold, an error once they can't.
 */
export function rejectionNotice(
	status: SignerSetStatus,
): { tone: 'warning' | 'error'; message: string } | null {
	const { rejected, canReachThreshold, rejectedNames } =
		status;
	if (rejected === 0) return null;
	const who =
		rejected === 1
			? COPY.notice.oneRejected(rejectedNames[0])
			: COPY.notice.manyRejected(rejected);
	return canReachThreshold
		? {
				tone: 'warning',
				message: who,
			}
		: {
				tone: 'error',
				message: COPY.notice.cantReachThreshold(who),
			};
}
