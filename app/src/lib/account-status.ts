// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';

import { memberStatus } from '@/components/invitations/member-status';

import { validatePublicKey } from './sui-utils';

interface MemberLike {
	publicKey: string;
	label: string | null;
	weight: number;
	isAccepted: boolean;
	isRejected: boolean;
}

export type AccountStatus =
	| { tone: 'ok' }
	| { tone: 'warning' | 'error'; message: string };

/**
 * Where an account stands in the switcher, from its invitations: healthy
 * while nobody rejected; a warning once someone did but the signers who
 * haven't (accepted or still invited) still carry the threshold; an error
 * once they can't, since the account can then never execute a proposal.
 */
export function accountStatus({
	members,
	threshold,
}: {
	members: MemberLike[];
	threshold: number;
}): AccountStatus {
	const rejected = members.filter(
		(member) => memberStatus(member) === 'rejected',
	);
	if (rejected.length === 0) return { tone: 'ok' };

	const reachableWeight = members
		.filter((member) => memberStatus(member) !== 'rejected')
		.reduce((sum, member) => sum + member.weight, 0);
	if (reachableWeight < threshold)
		return {
			tone: 'error',
			message: `Can’t move funds. ${signerCount(rejected.length)} rejected.`,
		};

	return {
		tone: 'warning',
		message:
			rejected.length === 1
				? `${signerName(rejected[0])} rejected the invitation.`
				: `${signerCount(rejected.length)} rejected their invitations.`,
	};
}

function signerCount(count: number) {
	return count === 1 ? '1 signer' : `${count} signers`;
}

/** The key's label, else its short address. */
function signerName(member: MemberLike) {
	if (member.label) return member.label;
	const { address } = validatePublicKey(member.publicKey);
	return address ? formatAddress(address) : 'A signer';
}
