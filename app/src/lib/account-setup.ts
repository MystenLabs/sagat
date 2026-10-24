// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigWithMembers } from '@mysten/sagat';

import {
	accountCreator,
	isLegacyAccount,
} from './account-name';
import { formatDateTime } from './dates';
import { thresholdLabel } from './threshold';

export interface AccountCreator {
	address: string;
	label: string | null;
	/** The signed-in key created it. */
	isYou: boolean;
}

export interface AccountSetup {
	threshold: number;
	/** "4 of 7". */
	thresholdLabel: string;
	signerCount: number;
	totalWeight: number;
	/** ISO timestamp, or null when the API doesn't know. */
	createdAt: string | null;
	/** `createdAt` for people, or null. */
	createdLabel: string | null;
	creator: AccountCreator | null;
}

/** The facts both the overview strip and the setup card show. */
export function accountSetup({
	multisig,
	currentAddress,
}: {
	multisig: MultisigWithMembers;
	currentAddress: string | null | undefined;
}): AccountSetup {
	const creator = accountCreator(multisig);
	// Legacy accounts were stamped with the migration's run time, not the
	// time they were made, so their creation date is unknown.
	const createdAt = isLegacyAccount(multisig)
		? null
		: multisig.createdAt;
	return {
		threshold: multisig.threshold,
		thresholdLabel: thresholdLabel(multisig),
		signerCount: multisig.totalMembers,
		totalWeight: multisig.totalWeight,
		createdAt,
		createdLabel: formatDateTime(createdAt),
		creator: creator && {
			...creator,
			isYou: creator.address === currentAddress,
		},
	};
}
