// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/** What a wallet with no name is called in the copy. */
export const UNNAMED_WALLET = 'your wallet';

/** The line shown when the user turns the wallet's request down. */
export function declinedMessage(wallet: string) {
	return `You declined the request in ${wallet}. You’re not signed in.`;
}

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
		super(declinedMessage(wallet));
		this.name = 'WalletDeclinedError';
		this.wallet = wallet;
		this.address = address;
		this.cause = cause;
	}
}

/** Thrown when a logout happens while a sign-in is in flight; handled silently. */
export class SignInCancelledError extends Error {
	constructor() {
		super('Signed out while signing in');
		this.name = 'SignInCancelledError';
	}
}
