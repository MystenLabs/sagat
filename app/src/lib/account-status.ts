// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigMember } from '@mysten/sagat';

import { signerRows, signerSetStatus } from './signers';

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
	members: MultisigMember[];
	threshold: number;
}): AccountStatus {
	const { rejected, canReachThreshold, rejectedNames } =
		signerSetStatus(signerRows(members, null), threshold);
	if (rejected === 0) return { tone: 'ok' };

	if (!canReachThreshold)
		return {
			tone: 'error',
			message: `Can’t move funds. ${signerCount(rejected)} rejected.`,
		};

	if (rejected > 1)
		return {
			tone: 'warning',
			message: `${signerCount(rejected)} rejected their invitations.`,
		};

	return {
		tone: 'warning',
		message: `${rejectedNames[0]} rejected the invitation.`,
	};
}

function signerCount(count: number) {
	return count === 1 ? '1 signer' : `${count} signers`;
}
