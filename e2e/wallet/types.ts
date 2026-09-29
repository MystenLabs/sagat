// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Handed from the test process to the injected wallet via
// `window.__E2E_WALLET_CONFIG__`.
export interface E2EWalletConfig {
	name: string;
	rpcUrl: string;
	// Bech32 `suiprivkey1…` Ed25519 secret keys, in account order.
	accounts: { label: string; secretKey: string }[];
}
