// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type SuiClientTypes } from '@mysten/sui/client';
import { type Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { Transaction } from '@mysten/sui/transactions';

import { parsePublicKey } from '../../src/utils/pubKey';
import {
	getLocalClient,
	LOCALNET_WAIT,
} from './sui-network';

const client = getLocalClient();

export interface Signer {
	label: string;
	address: string;
	sign(bytes: Uint8Array): Promise<string>;
}

export function multisigSigner(
	label: string,
	keys: Ed25519Keypair[],
	threshold: number,
	signingKeys: Ed25519Keypair[] = keys.slice(0, threshold),
): Signer & { publicKey: MultiSigPublicKey } {
	const publicKey = MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: keys.map((k) => ({
			publicKey: k.getPublicKey(),
			weight: 1,
		})),
	});
	return {
		label,
		publicKey,
		address: publicKey.toSuiAddress(),
		async sign(bytes) {
			const partials = await Promise.all(
				signingKeys.map(
					async (k) =>
						(await k.signTransaction(bytes)).signature,
				),
			);
			return publicKey.combinePartialSignatures(partials);
		},
	};
}

// The multisig signature of `set` from the signatures of its members.
export const combinedSignature = (
	set: {
		threshold: number;
		members: {
			publicKey: string;
			weight: number;
			order: number;
		}[];
	},
	signatures: { publicKey: string; signature: string }[],
) => {
	const members = [...set.members].sort(
		(a, b) => a.order - b.order,
	);
	return MultiSigPublicKey.fromPublicKeys({
		threshold: set.threshold,
		publicKeys: members.map((m) => ({
			publicKey: parsePublicKey(m.publicKey),
			weight: m.weight,
		})),
	}).combinePartialSignatures(
		members.flatMap(
			(m) =>
				signatures.find((s) => s.publicKey === m.publicKey)
					?.signature ?? [],
		),
	);
};

export function keySigner(
	label: string,
	key: Ed25519Keypair,
): Signer {
	return {
		label,
		address: key.toSuiAddress(),
		async sign(bytes) {
			return (await key.signTransaction(bytes)).signature;
		},
	};
}

// Paid with `gasCoin` when given.
export async function build(
	sender: string,
	fill: (tx: Transaction) => void,
	gasCoin?: {
		objectId: string;
		version: string;
		digest: string;
	},
) {
	const tx = new Transaction();
	tx.setSender(sender);
	if (gasCoin) tx.setGasPayment([gasCoin]);
	fill(tx);
	return tx.build({ client });
}

export const executeInclude = {
	effects: true,
	transaction: true,
	objectTypes: true,
} as const;

export type Executed = SuiClientTypes.TransactionResult<
	typeof executeInclude
>;

export async function execute(
	bytes: Uint8Array,
	signature: string,
): Promise<Executed> {
	const result = await client.executeTransaction({
		transaction: bytes,
		signatures: [signature],
		include: executeInclude,
	});
	await client.waitForTransaction({
		result,
		...LOCALNET_WAIT,
	});
	return result;
}

export async function run(
	sender: string,
	signer: Signer,
	fill: (tx: Transaction) => void,
) {
	const bytes = await build(sender, fill);
	return execute(bytes, await signer.sign(bytes));
}

export function expectSuccess(result: Executed) {
	if (result.$kind !== 'Transaction') {
		throw new Error(
			`Expected success, got: ${JSON.stringify(result.FailedTransaction.status)}`,
		);
	}
	return result.Transaction;
}
