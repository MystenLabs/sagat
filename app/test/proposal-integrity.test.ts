// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import {
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import {
	fromBase64,
	toBase58,
	toBase64,
} from '@mysten/sui/utils';
import { expect, test } from 'vitest';

import { checkProposalIntegrity } from '../src/lib/proposal-integrity';

function oneOfTwoAccount() {
	const keys = [new Ed25519Keypair(), new Ed25519Keypair()];
	const threshold = 1;
	const address = MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: keys.map((key) => ({
			publicKey: key.getPublicKey(),
			weight: 1,
		})),
	}).toSuiAddress();
	const multisig = {
		address,
		threshold,
		members: keys.map((key, order) => ({
			publicKey: key.getPublicKey().toSuiPublicKey(),
			weight: 1,
			order,
		})),
	};
	return { keys, address, multisig };
}

test('refuses a wallet that is not one of the signers', async () => {
	const { address, multisig } = oneOfTwoAccount();

	const tx = new Transaction();
	tx.setSender(address);
	tx.setGasPayment([
		{
			objectId: '0x2',
			version: '1',
			digest: toBase58(new Uint8Array(32)),
		},
	]);
	tx.setGasPrice(1000);
	tx.setGasBudget(10_000_000);
	tx.transferObjects([tx.gas], '0x3');
	const transactionBytes = toBase64(await tx.build());
	const digest = TransactionDataBuilder.getDigestFromBytes(
		fromBase64(transactionBytes),
	);

	expect(
		checkProposalIntegrity(
			{
				transactionBytes,
				digest,
				multisigAddress: address,
				multisig,
			},
			{
				openedDigest: digest,
				signerAddress: new Ed25519Keypair().toSuiAddress(),
			},
		),
	).toBe('notSigner');
});

test("refuses bytes that don't decode as a transaction", () => {
	const { keys, address, multisig } = oneOfTwoAccount();
	const transactionBytes = toBase64(
		new Uint8Array([1, 2, 3]),
	);

	expect(
		checkProposalIntegrity(
			{
				transactionBytes,
				digest: toBase58(new Uint8Array(32)),
				multisigAddress: address,
				multisig,
			},
			{
				openedDigest: toBase58(new Uint8Array(32)),
				signerAddress: keys[0].toSuiAddress(),
			},
		),
	).toBe('unreadable');
});
