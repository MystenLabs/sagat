// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Decimals that behave differently: none (whole amounts only), SUI's 9,
// and 18 (bridged ETH-style tokens), where a u64 holds under 19 whole
// tokens and a float can't hold every raw unit.
export const COIN_DECIMALS = [0, 9, 18] as const;

/** The largest balance a coin can hold on chain. */
export const U64_MAX = 2n ** 64n - 1n;
