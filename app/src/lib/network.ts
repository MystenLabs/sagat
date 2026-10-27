// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Kept free of React, so plain modules (and the e2e suite) can use them.

export type SuiNetwork =
	'mainnet' | 'testnet' | 'devnet' | 'localnet';

/** The network's name in copy: "Mainnet", "Testnet". */
export function networkLabel(network: SuiNetwork) {
	return network.charAt(0).toUpperCase() + network.slice(1);
}
