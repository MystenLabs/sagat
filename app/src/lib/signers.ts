// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigMember } from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';

import { memberStatus } from './member-status';
import { validatePublicKey } from './sui-utils';

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
						: 'Unknown key'),
				status: memberStatus(member),
				isYou: !!address && address === currentAddress,
				isCreator: !!address && address === creatorAddress,
			};
		});
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
			? 'Both accepted'
			: `All ${total} accepted`;
	const head = `${accepted} of ${total} accepted`;
	if (rejected === 0) return head;
	const tail =
		rejected === 1
			? `${rejectedNames[0]} rejected`
			: `${rejected} rejected`;
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
			? `${rejectedNames[0]} rejected the invitation to join this account.`
			: `${rejected} signers rejected their invitations to join this account.`;
	return canReachThreshold
		? {
				tone: 'warning',
				message: `${who} The other signers can still reach the threshold.`,
			}
		: {
				tone: 'error',
				message: `${who} The rest can’t reach the threshold, so this account can’t move funds.`,
			};
}
