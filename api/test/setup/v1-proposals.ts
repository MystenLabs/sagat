// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';
import {
	normalizeSuiAddress,
	toBase58,
	toHex,
} from '@mysten/sui/utils';

import { db } from '../../src/db';
import { SchemaProposals } from '../../src/db/schema';
import { type SuiNetwork } from '../../src/utils/client';

const random = (length: number) =>
	crypto.getRandomValues(new Uint8Array(length));

// Transfer bytes from the account, built without the chain, on a made-up gas coin.
export const offlineTransfer = async (sender: string) => {
	const tx = new Transaction();
	tx.setSender(sender);
	tx.setGasPrice(1000);
	tx.setGasBudget(10_000_000);
	tx.setGasPayment([
		{
			objectId: normalizeSuiAddress(toHex(random(32))),
			version: '1',
			digest: toBase58(random(32)),
		},
	]);
	const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
	tx.transferObjects([coin], tx.pure.address(sender));
	return (await tx.build()).toBase64();
};

// A pending proposal row, as a create on that network would leave it; a transfer unless `transactionBytes` is given.
export const insertProposal = async (
	account: string,
	network: SuiNetwork,
	proposerAddress: string,
	transactionBytes?: string,
) => {
	transactionBytes ??= await offlineTransfer(account);
	const [proposal] = await db
		.insert(SchemaProposals)
		.values({
			accountAddress: account,
			digest: await Transaction.from(
				transactionBytes,
			).getDigest(),
			transactionBytes,
			proposerAddress,
			network,
		})
		.returning();
	return proposal;
};
