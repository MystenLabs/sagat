// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/// A coin anyone can mint, so e2e tests can hold a coin other than SUI.
module test_coin::test_coin;

use sui::coin::{Self, Coin, TreasuryCap};

// `publishTestCoin` in `support/test-coin.ts` rewrites these three lines to
// publish coins with other decimals, symbols and names.
const DECIMALS: u8 = 6;
const SYMBOL: vector<u8> = b"TEST";
const NAME: vector<u8> = b"Test Coin";

public struct TEST_COIN has drop {}

public struct Faucet has key {
    id: UID,
    cap: TreasuryCap<TEST_COIN>,
}

#[allow(deprecated_usage)]
fun init(otw: TEST_COIN, ctx: &mut TxContext) {
    let (cap, metadata) = coin::create_currency(
        otw,
        DECIMALS,
        SYMBOL,
        NAME,
        b"",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::share_object(Faucet { id: object::new(ctx), cap });
}

public fun mint(faucet: &mut Faucet, amount: u64, ctx: &mut TxContext): Coin<TEST_COIN> {
    faucet.cap.mint(amount, ctx)
}
