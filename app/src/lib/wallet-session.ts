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

/** Thrown when the session ends (a logout, or a disconnect in the wallet) while a sign-in is in flight; handled silently. */
export class SignInCancelledError extends Error {
	constructor() {
		super('Signed out while signing in');
		this.name = 'SignInCancelledError';
	}
}
