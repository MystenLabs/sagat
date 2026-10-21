// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type SignerSetMember } from '@mysten/sagat';

// A member of a signer set as the API returns it on an account: weight 1,
// first in order, accepted, and without a label unless told otherwise.
export const member = (
	signerSetAddress: string,
	publicKey: string,
	overrides: Partial<
		Omit<SignerSetMember, 'signerSetAddress' | 'publicKey'>
	> = {},
): SignerSetMember => ({
	signerSetAddress,
	publicKey,
	weight: 1,
	order: 0,
	isAccepted: true,
	isRejected: false,
	label: null,
	...overrides,
});
