// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export const LocalStorageKeys = {
	SuiNetwork: 'SuiNetwork',
	SidebarOpen: 'SidebarOpen',
	// The wallet kit's saved session, restored on load. Keep the value: a
	// new one would sign everyone out.
	WalletSession:
		'mysten-dapp-kit:selected-wallet-and-address',
} as const;

/** The multisig a wallet address last opened. */
export const lastViewedMultisigKey = (address: string) =>
	`lastViewedMultisig_${address}`;
