// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '../content';

/** Thrown when the wallet's sign-in signature fails: the user declined or the wallet refused. */
export class WalletDeclinedError extends Error {
	readonly wallet: string;
	// The account the request was for, so a late rejection can be told apart.
	readonly address: string;
	readonly cause: unknown;

	constructor(
		wallet: string,
		address: string,
		cause?: unknown,
	) {
		super(content.signedOut.declined(wallet));
		this.name = 'WalletDeclinedError';
		this.wallet = wallet;
		this.address = address;
		this.cause = cause;
	}
}

/** The wallet didn't sign: declined, closed or failed. Nothing was created. */
export class SignatureDeclinedError extends Error {
	/** What the wallet threw. */
	readonly cause: unknown;

	constructor(cause: unknown) {
		super('The wallet didn’t sign the proposal.');
		this.name = 'SignatureDeclinedError';
		this.cause = cause;
	}
}

/** Thrown when the session ends (a logout, or a disconnect in the wallet) while a sign-in is in flight; handled silently. */
export class SignInCancelledError extends Error {
	constructor() {
		super('Signed out while signing in');
		this.name = 'SignInCancelledError';
	}
}

const DECLINE_WORDS = /reject|declin|denied|cancel|closed/i;

function messageOf(error: unknown): string | undefined {
	if (typeof error === 'string') return error;
	if (typeof error === 'object' && error !== null) {
		const { message } = error as { message?: unknown };
		if (typeof message === 'string') return message;
	}
	return undefined;
}

/** Whether the user turned down a wallet prompt, read from the wallet's message or its causes. */
export function isWalletDecline(error: unknown): boolean {
	let current = error;
	for (
		let depth = 0;
		depth < 4 && current != null;
		depth++
	) {
		const message = messageOf(current);
		if (
			message &&
			/\buser/i.test(message) &&
			DECLINE_WORDS.test(message)
		)
			return true;
		current =
			typeof current === 'object'
				? (current as { cause?: unknown }).cause
				: undefined;
	}
	return false;
}
