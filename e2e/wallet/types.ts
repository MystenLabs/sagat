// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Handed from the test process to the injected wallet via
// `window.__E2E_WALLET_CONFIG__`.
export interface E2EWalletConfig {
	name: string;
	rpcUrl: string;
	// Bech32 `suiprivkey1…` Ed25519 secret keys, in account order.
	accounts: { label: string; secretKey: string }[];
	// The chains the wallet advertises. Defaults to the dev wallet's own list
	// (every standard Sui chain plus `sui:localnet`).
	chains?: `sui:${string}`[];
	// Rejects the silent connect the wallet kit restores a saved session
	// with, the way a wallet whose restore throws does. Connecting from the
	// app still works.
	failRestore?: boolean;
	// Rejects a connect from the app, the way a user declining the
	// connection does. The silent restore still works.
	declineConnect?: boolean;
	// Rejects every personal message signature, the way a user declining
	// the sign-in request does.
	declineSign?: boolean;
}
