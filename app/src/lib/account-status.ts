// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigMember } from '@mysten/sagat';

import { content } from '../content';
import { signerRows, signerSetStatus } from './signers';

const COPY = content.signers.accountStatus;

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
			message: COPY.needsRejected(rejected),
		};

	if (rejected > 1)
		return {
			tone: 'warning',
			message: COPY.manyRejected(rejected),
		};

	return {
		tone: 'warning',
		message: COPY.oneRejected(rejectedNames[0]),
	};
}
