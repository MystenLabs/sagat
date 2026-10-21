// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The Sui networks the API knows of. `SUPPORTED_NETWORKS` picks the ones a
// server serves; the spec's `Network` lists them all.
export const SUI_NETWORKS = [
	'mainnet',
	'testnet',
	'devnet',
	'localnet',
] as const;
