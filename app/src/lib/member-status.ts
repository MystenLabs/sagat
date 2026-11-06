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

/**
 * How a signer's weight is drawn on the invitation's weight bar: accepted
 * weight counts whoever it belongs to, yours is marked while you decide,
 * and rejected weight is drawn like pending since it may still change.
 */
export function weightTone(member: {
	isAccepted: boolean;
	isYou: boolean;
}) {
	return member.isAccepted
		? ('accepted' as const)
		: member.isYou
			? ('you' as const)
			: ('pending' as const);
}
