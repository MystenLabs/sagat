// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	ClientWithCoreApi,
	SuiClientTypes,
} from '@mysten/sui/client';
import {
	coinWithBalance,
	Transaction,
} from '@mysten/sui/transactions';
import { SUI_TYPE_ARG, toBase64 } from '@mysten/sui/utils';

import { isSuiCoinType } from '../../lib/coins';

// The SDK pays gas with at most this many coins (MAX_GAS_PAYMENT_OBJECTS in
// @mysten/sui's core resolver, the protocol's max_gas_payment_objects).
const MAX_GAS_PAYMENT_OBJECTS = 256;
// A MergeCoins command takes fewer than max_arguments (512) sources.
const MAX_MERGE_SOURCES = 511;
// Coins merged into the gas coin on top of the gas payment. A PTB takes up
// to 2048 input objects, but the 128 KiB transaction size limit binds
// first: each merged coin costs about 78 bytes (its input plus its
// argument) and the 256 gas coins about 18.7 KiB, so 1200 leaves room for
// the multisig signature. An account with more coins than 256 + 1200 keeps
// the rest after Max; sending again sweeps the next batch.
const MAX_MERGED_COINS = 1200;

export interface BuildTransferTransactionParams {
	sender: string;
	recipient: string;
	coinType: string;
	/** On-chain integer amount (already scaled by decimals). */
	amount: bigint;
	transferAllSui?: boolean;
	client: ClientWithCoreApi;
}

/**
 * Build and serialize a transfer transaction from sender to recipient.
 */
export async function buildTransferTransaction({
	sender,
	recipient,
	coinType,
	amount,
	transferAllSui = false,
	client,
}: BuildTransferTransactionParams): Promise<string> {
	if (amount <= 0n) {
		throw new Error('Amount must be greater than zero.');
	}

	const tx = new Transaction();
	tx.setSender(sender);

	if (transferAllSui) {
		if (!isSuiCoinType(coinType)) {
			throw new Error(
				'MAX gas-coin transfer is only supported for SUI.',
			);
		}

		const coins = await listSuiCoins(
			client,
			sender,
			MAX_GAS_PAYMENT_OBJECTS + MAX_MERGED_COINS,
		);
		// Up to 256 coins the client picks gas itself, which is also how an
		// address balance joins the gas coin (it adds a reservation for it).
		// Past that, pay with the first 256 and merge the rest in, since the
		// client would leave them behind. An address balance stays put on
		// this path: the SDK does not export the reservation ref it uses.
		if (coins.length > MAX_GAS_PAYMENT_OBJECTS) {
			tx.setGasPayment(
				coins
					.slice(0, MAX_GAS_PAYMENT_OBJECTS)
					.map(({ objectId, version, digest }) => ({
						objectId,
						version,
						digest,
					})),
			);
			const rest = coins.slice(MAX_GAS_PAYMENT_OBJECTS);
			for (
				let i = 0;
				i < rest.length;
				i += MAX_MERGE_SOURCES
			) {
				tx.mergeCoins(
					tx.gas,
					rest
						.slice(i, i + MAX_MERGE_SOURCES)
						.map(({ objectId, version, digest }) =>
							tx.objectRef({ objectId, version, digest }),
						),
				);
			}
		}

		tx.transferObjects([tx.gas], recipient);
		return toBase64(await tx.build({ client }));
	}

	const coin = tx.add(
		coinWithBalance({
			type: coinType,
			balance: amount,
			useGasCoin: isSuiCoinType(coinType),
		}),
	);
	tx.transferObjects([coin], recipient);

	return toBase64(await tx.build({ client }));
}

/** The owner's SUI coins, paging until the end or `max` coins. */
async function listSuiCoins(
	client: ClientWithCoreApi,
	owner: string,
	max: number,
): Promise<SuiClientTypes.Coin[]> {
	const coins: SuiClientTypes.Coin[] = [];
	let cursor: string | null = null;
	do {
		const page: SuiClientTypes.ListCoinsResponse =
			await client.core.listCoins({
				owner,
				coinType: SUI_TYPE_ARG,
				cursor,
			});
		coins.push(...page.objects);
		cursor = page.hasNextPage ? page.cursor : null;
	} while (cursor && coins.length < max);
	return coins.slice(0, max);
}
