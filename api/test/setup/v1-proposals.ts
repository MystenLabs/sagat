// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersonalMessages } from '@mysten/sagat';
import {
	type SagatV1Client,
	type SignerSet,
} from '@mysten/sagat/v1';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { Transaction } from '@mysten/sui/transactions';
import {
	fromBase64,
	normalizeSuiAddress,
	toBase58,
	toHex,
} from '@mysten/sui/utils';

import { db } from '../../src/db';
import { SchemaProposals } from '../../src/db/schema';
import { type SuiNetwork } from '../../src/utils/client';
import { parsePublicKey } from '../../src/utils/pubKey';
import {
	sign,
	type TestUser,
} from '../framework/api-test-framework';

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

// A pending proposal row, as a create on that network would leave it.
export const insertProposal = async (
	account: string,
	network: SuiNetwork,
	proposerAddress: string,
) => {
	const transactionBytes = await offlineTransfer(account);
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

export const signedBy = async (
	user: TestUser,
	transactionBytes: string,
) =>
	(
		await user.keypair.signTransaction(
			fromBase64(transactionBytes),
		)
	).signature;

export const proposeWith = async (
	client: SagatV1Client,
	proposer: TestUser,
	accountAddress: string,
	transactionBytes: string,
	description?: string,
) =>
	client.createProposal({
		accountAddress,
		network: 'localnet',
		transactionBytes,
		signature: await signedBy(proposer, transactionBytes),
		description,
	});

export const voteWith = async (
	client: SagatV1Client,
	voter: TestUser,
	proposal: { digest: string; transactionBytes: string },
) =>
	client.voteForProposal(proposal.digest, {
		signature: await signedBy(
			voter,
			proposal.transactionBytes,
		),
	});

export const cancelWith = async (
	client: SagatV1Client,
	user: TestUser,
	proposal: { digest: string; accountAddress: string },
) =>
	client.cancelProposal(proposal.digest, {
		signature: await sign(
			user,
			PersonalMessages.cancelProposal(
				proposal.digest,
				proposal.accountAddress,
			),
		),
	});

// The multisig signature of `set` from the proposal's signatures of its members.
export const combinedSignature = (
	set: Pick<SignerSet, 'threshold' | 'members'>,
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
