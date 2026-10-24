// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ClientWithCoreApi } from '@mysten/sui/client';
import {
	coinWithBalance,
	Transaction,
} from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';

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
