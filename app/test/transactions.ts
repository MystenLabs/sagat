// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	buildSignerChange,
	deriveAliasesObjectId,
	type Composition,
} from '@mysten/sagat';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import {
	Inputs,
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import {
	fromBase64,
	normalizeSuiAddress,
	toBase58,
	toBase64,
} from '@mysten/sui/utils';
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';

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
const addressOf = (set: Composition) =>
	MultiSigPublicKey.fromPublicKeys({
		threshold: set.threshold,
		publicKeys: set.members.map((m) => ({
			publicKey: publicKeyFromSuiBytes(m.publicKey),
			weight: m.weight,
		})),
	}).toSuiAddress();

// The pod `oldSet` makes up, and the bytes of its signer change to `newSet`, with `others` acting beside it.
export async function signerChange(
	oldSet: Composition,
	newSet: Composition,
	others: Composition[] = [],
) {
	const pod = addressOf(oldSet);
	const tx = new Transaction();
	tx.setSender(pod);
	tx.setGasPrice(1000);
	tx.setGasBudget(10_000_000);
	tx.setGasPayment([
		{
			objectId: normalizeSuiAddress('0x99'),
			version: '1',
			digest: toBase58(new Uint8Array(32).fill(1)),
		},
	]);
	tx.object(
		Inputs.SharedObjectRef({
			objectId: deriveAliasesObjectId(pod),
			initialSharedVersion: 1,
			mutable: true,
		}),
	);
	buildSignerChange(tx, {
		account: pod,
		aliases: [pod, ...others.map(addressOf)],
		oldSet: pod,
		newSet,
		known: [oldSet, ...others],
		chain: toBase58(new Uint8Array(32).fill(7)),
		epoch: 5,
	});
	return { pod, bytes: toBase64(await tx.build()) };
}
