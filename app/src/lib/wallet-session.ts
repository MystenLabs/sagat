// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/** The line shown when the user turns the wallet's request down. */
export function declinedMessage(wallet: string) {
	return `You declined the request in ${wallet}. You’re not signed in.`;
}

/** Thrown when the wallet step (connect or signature) fails: the user declined or the wallet refused. */
export class WalletDeclinedError extends Error {
	readonly wallet: string;
	readonly cause: unknown;

	constructor(wallet: string, cause?: unknown) {
		super(declinedMessage(wallet));
		this.name = 'WalletDeclinedError';
		this.wallet = wallet;
		this.cause = cause;
	}
}
