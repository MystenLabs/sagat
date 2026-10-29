// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	formatAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';

/**
 * Who added an external proposer: the member's key label, or their short
 * address when the key has none, with " (you)" when it was the signed-in
 * address. `labels` is `memberLabels` of the account's members.
 */
export function addedByName(
	addedBy: string,
	labels: Map<string, string | null>,
	currentAddress: string | undefined,
): string {
	const address = normalizeSuiAddress(addedBy);
	const name =
		labels.get(address) || formatAddress(address);
	const isYou =
		!!currentAddress &&
		normalizeSuiAddress(currentAddress) === address;
	return isYou ? `${name} (you)` : name;
}
