// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/** The messages a key signs, as the API verifies them. */
export const PersonalMessages = {
	connect: (expiry: string) =>
		`Verifying address ownership until: ${expiry}`,
};

/** An expiry five minutes from now, for signed messages. */
export const defaultExpiry = () =>
	new Date(Date.now() + 5 * 60 * 1000).toISOString();
