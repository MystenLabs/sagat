// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/** Where a signer stands on the account: an accept wins over a reject. */
export function memberStatus(member: {
	isAccepted: boolean;
	isRejected: boolean;
}) {
	return member.isAccepted
		? ('accepted' as const)
		: member.isRejected
			? ('rejected' as const)
			: ('pending' as const);
}
