// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import {
	fromBase64,
	toBase58,
	toBase64,
} from '@mysten/sui/utils';

// A transfer's bytes from `sender`, with the given expiration.
export async function transfer(
	expiration?: Parameters<Transaction['setExpiration']>[0],
	sender = '0x1',
) {
	const tx = new Transaction();
	tx.setSender(sender);
	tx.setGasPayment([
		{
			objectId: '0x2',
			version: '1',
			digest: toBase58(new Uint8Array(32)),
		},
	]);
	tx.setGasPrice(1000);
	tx.setGasBudget(10_000_000);
	if (expiration) tx.setExpiration(expiration);
	tx.transferObjects([tx.gas], '0x3');
	return toBase64(await tx.build());
}

// The digest of a transaction's base64 bytes.
export const digestOf = (bytes: string) =>
	TransactionDataBuilder.getDigestFromBytes(
		fromBase64(bytes),
	);
