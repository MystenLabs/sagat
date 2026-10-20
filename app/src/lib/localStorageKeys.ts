// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export const LocalStorageKeys = {
	SuiNetwork: 'SuiNetwork',
} as const;

/** The multisig a wallet address last opened. */
export const lastViewedMultisigKey = (address: string) =>
	`lastViewedMultisig_${address}`;
