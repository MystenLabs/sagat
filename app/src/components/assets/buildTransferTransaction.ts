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
export async function listSuiCoins(
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
				// The node's page maximum.
				limit: Math.min(max, 1000),
			});
		coins.push(...page.objects);
		cursor = page.hasNextPage ? page.cursor : null;
	} while (cursor && coins.length < max);
	return coins.slice(0, max);
}
