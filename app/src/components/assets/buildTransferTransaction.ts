// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ClientWithCoreApi } from '@mysten/sui/client';
import {
	coinWithBalance,
	Transaction,
} from '@mysten/sui/transactions';
import { SUI_TYPE_ARG } from '@mysten/sui/utils';

export interface BuildTransferTransactionParams {
	/** Address that owns the coins (typically the multisig). */
	sender: string;
	recipient: string;
	coinType: string;
	/** On-chain integer amount (already scaled by decimals). */
	amount: bigint;
	client: ClientWithCoreApi;
}

/**
 * Build and JSON-serialize a "transfer N units of coinType to recipient"
 * transaction sent from `sender`.
 *
 * Uses the SDK's `coinWithBalance` intent so we don't have to manually
 * list / merge / split coin objects: the resolver does the right thing
 * for both SUI (using the gas coin) and arbitrary `Coin<T>` (fetching
 * candidate coins via the client).
 *
 * RPC cost at call time:
 *   - SUI: 0 (gas coin is implicit, resolved by the wallet at sign time).
 *   - Other coin types: 1 (`listCoins` for the given type).
 *
 * The returned string is the canonical JSON form accepted by both
 * `Transaction.from()` and our `useDryRun` / `useCreateProposal` hooks.
 */
export async function buildTransferTransaction({
	sender,
	recipient,
	coinType,
	amount,
	client,
}: BuildTransferTransactionParams): Promise<string> {
	if (amount <= 0n) {
		throw new Error('Amount must be greater than zero.');
	}

	const tx = new Transaction();
	tx.setSender(sender);

	const coin = tx.add(
		coinWithBalance({
			type: coinType,
			balance: amount,
			useGasCoin: coinType === SUI_TYPE_ARG,
		}),
	);
	tx.transferObjects([coin], recipient);

	return tx.toJSON({ client });
}
