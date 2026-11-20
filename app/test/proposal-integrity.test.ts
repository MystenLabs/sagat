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

import {
	actingVerdict,
	checkActingSets,
	checkProposalIntegrity,
	rebuildAccount,
} from '../src/lib/proposal-integrity';

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

test('a pod that never changed passes both rules as one check', () => {
	const { address, multisig } = oneOfTwoAccount();

	expect(rebuildAccount(multisig, address)).toBe(address);
	const check = checkActingSets([multisig], {
		kind: 'read',
		aliases: [address],
	});
	expect(actingVerdict(check)).toBe('ok');
	expect(check).toMatchObject({ unidentified: [] });
});

test('rule 1 refuses signers that do not rebuild the address, with no alias read', () => {
	const { address } = oneOfTwoAccount();
	const other = oneOfTwoAccount();

	expect(
		rebuildAccount(other.multisig, address),
	).toBeNull();
});

test('rule 2 refuses a pod whose own address is not in its alias set', () => {
	const { address, multisig } = oneOfTwoAccount();
	const other = oneOfTwoAccount();

	expect(rebuildAccount(multisig, address)).toBe(address);
	expect(
		actingVerdict(
			checkActingSets([multisig], {
				kind: 'read',
				aliases: [other.address],
			}),
		),
	).toBe('refused');
});

test('an alias no shown set rebuilds is unidentified, and the pod still passes', () => {
	const { address, multisig } = oneOfTwoAccount();
	const other = oneOfTwoAccount();

	const check = checkActingSets([multisig], {
		kind: 'read',
		aliases: [address, other.address],
	});
	expect(actingVerdict(check)).toBe('ok');
	expect(check).toMatchObject({
		unidentified: [other.address],
	});
});

test('an unread alias set leaves rule 2 unchecked while rule 1 still decides', () => {
	const { address, multisig } = oneOfTwoAccount();
	const other = oneOfTwoAccount();

	expect(
		actingVerdict(
			checkActingSets([multisig], { kind: 'failed' }),
		),
	).toBe('unchecked');
	expect(rebuildAccount(multisig, address)).toBe(address);
	expect(
		rebuildAccount(other.multisig, address),
	).toBeNull();
});

test('of two shown sets, only the one that is an alias acts', () => {
	const { address } = oneOfTwoAccount();
	const current = oneOfTwoAccount();
	const stranger = oneOfTwoAccount();

	const check = checkActingSets(
		[current.multisig, stranger.multisig],
		{ kind: 'read', aliases: [address, current.address] },
	);
	expect(check).toEqual({
		kind: 'checked',
		acting: [
			{ set: current.multisig, address: current.address },
		],
		refused: [stranger.multisig],
		unidentified: [address],
	});
	expect(actingVerdict(check)).toBe('refused');
});
