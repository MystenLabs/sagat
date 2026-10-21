// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigMember } from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';

import { memberStatus } from './member-status';
import { validatePublicKey } from './sui-utils';

interface SignerLike {
	weight: number;
	isAccepted: boolean;
	isRejected: boolean;
}

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
}

export interface SignerRow {
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
): SignerRow[] {
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

/** Where the signer set stands, counted by invitation status. */
export function signerSetStatus(
	members: SignerLike[],
	threshold: number,
): SignerSetStatus {
	let accepted = 0;
	let rejected = 0;
	let reachableWeight = 0;
	for (const member of members) {
		const status = memberStatus(member);
		if (status === 'accepted') accepted += 1;
		if (status === 'rejected') rejected += 1;
		else reachableWeight += member.weight;
	}
	return {
		total: members.length,
		accepted,
		rejected,
		pending: members.length - accepted - rejected,
		canReachThreshold: reachableWeight >= threshold,
	};
}

/**
 * The one-line summary beside the signers heading: "All 5 accepted",
 * "Both accepted", "4 of 5 accepted · Hana rejected", "2 of 5 accepted ·
 * 3 rejected". `rejectedNames` names the rejected signers, in order.
 */
export function signerSummary(
	status: SignerSetStatus,
	rejectedNames: string[],
): string {
	const { total, accepted, rejected } = status;
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
	rejectedNames: string[],
): { tone: 'warning' | 'error'; message: string } | null {
	const { rejected, canReachThreshold } = status;
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

/** "Sep 2, 2026, 10:42 AM" in the viewer's locale, or null when unknown. */
export function formatDateTime(iso: string | null) {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	});
}

/** "Sep 4, 2026" in the viewer's locale, or null when unknown. */
export function formatDate(iso: string | null) {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(undefined, {
		dateStyle: 'medium',
	});
}
