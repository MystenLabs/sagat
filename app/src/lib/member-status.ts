// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { KeyAnswer } from '@mysten/sagat/v1';

/** Where a signer stands on the account: still `invited` reads as pending. */
export function memberStatus(member: {
	answer: KeyAnswer;
}) {
	return member.answer === 'invited'
		? ('pending' as const)
		: member.answer;
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
