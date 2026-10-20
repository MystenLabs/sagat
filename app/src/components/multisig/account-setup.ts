// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigWithMembers } from '@mysten/sagat';

import { accountCreator } from '@/components/invitations/account-name';
import { formatDateTime } from '@/lib/signers';
import { thresholdLabel } from '@/lib/threshold';

export interface AccountCreator {
	address: string;
	label: string | null;
	/** The signed-in key created it. */
	isYou: boolean;
}

export interface AccountSetup {
	/** "4 of 7". */
	threshold: string;
	signers: number;
	totalWeight: number;
	/** ISO timestamp, or null when the API doesn't know. */
	createdAt: string | null;
	/** `createdAt` for people, or null. */
	created: string | null;
	creator: AccountCreator | null;
}

/**
 * The facts both the overview strip and the setup card show. `totalWeight`
 * comes from the freshest copy of the account the caller has.
 */
export function accountSetup({
	multisig,
	totalWeight,
	currentAddress,
}: {
	multisig: MultisigWithMembers;
	totalWeight: number;
	currentAddress: string | null | undefined;
}): AccountSetup {
	const creator = accountCreator(multisig);
	return {
		threshold: thresholdLabel({
			threshold: multisig.threshold,
			totalWeight,
		}),
		signers: multisig.totalMembers,
		totalWeight,
		createdAt: multisig.createdAt,
		created: formatDateTime(multisig.createdAt),
		creator: creator && {
			...creator,
			isYou: creator.address === currentAddress,
		},
	};
}
