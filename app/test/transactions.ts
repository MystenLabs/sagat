// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';
import { toBase58, toBase64 } from '@mysten/sui/utils';

// A transfer's bytes, with the given expiration.
export async function transfer(
	expiration?: Parameters<Transaction['setExpiration']>[0],
) {
	const tx = new Transaction();
	tx.setSender('0x1');
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
