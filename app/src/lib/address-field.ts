// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { isValidSuiAddress } from '@mysten/sui/utils';

/** The status line under a Sui address field. */
export const ADDRESS_COPY = {
	valid: 'Valid Sui address',
	invalid:
		'This isn’t a valid Sui address. Check you pasted all of it: 0x and 64 characters.',
} as const;

/**
 * Whether a typed or pasted address (spaces around it ignored) is a Sui
 * address, and the error to show when it isn't. Empty is neither valid
 * nor an error.
 */
export function addressStatus(value: string): {
	valid: boolean;
	error: string | null;
} {
	const address = value.trim();
	const valid = !!address && isValidSuiAddress(address);
	return {
		valid,
		error: address && !valid ? ADDRESS_COPY.invalid : null,
	};
}
