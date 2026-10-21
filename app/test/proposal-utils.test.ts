// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	type ProposalSignerSet,
	type SignerSetWithMembers,
} from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { describe, expect, test } from 'vitest';

import {
	combineProposalSignatures,
	getProgressSignerSet,
	tallySignerSet,
} from '../src/lib/proposalUtils';

const [alice, bob, carol] = Array.from({ length: 3 }, () =>
	Ed25519Keypair.generate(),
);
const keyOf = (keypair: Ed25519Keypair) =>
	keypair.getPublicKey().toSuiPublicKey();

const bytes = new Uint8Array([1, 2, 3]);
const signatureOf = async (
	proposalId: number,
	keypair: Ed25519Keypair,
) => ({
	proposalId,
	publicKey: keyOf(keypair),
	signature: (await keypair.signTransaction(bytes))
		.signature,
});

const signerSet = (
	address: string,
	threshold: number,
	keypairs: Ed25519Keypair[],
): SignerSetWithMembers => ({
	address,
	label: null,
	status: 'verified',
	isVerified: true,
	threshold,
	totalWeight: keypairs.length,
	draftedBy: '0x1',
	createdAt: '2026-10-01T00:00:00.000Z',
	members: keypairs.map((keypair, order) => ({
		signerSetAddress: address,
		publicKey: keyOf(keypair),
		weight: 1,
		order,
		isAccepted: true,
		isRejected: false,
		label: null,
	})),
});

describe('proposal utils', () => {
	test('tallies the weight of the members that signed', async () => {
		const tally = tallySignerSet(
			{ signatures: [await signatureOf(1, bob)] },
			signerSet('0xa', 2, [alice, bob, carol]),
		);
		expect(tally.currentWeight).toBe(1);
		expect(tally.hasReachedThreshold).toBe(false);
		expect(tally.members.map((m) => m.hasSigned)).toEqual([
			false,
			true,
			false,
		]);
	});

	test('shows the set that can execute, else the closest one', () => {
		const set = (
			address: string,
			currentWeight: number,
			threshold: number,
		): ProposalSignerSet => ({
			address,
			label: null,
			threshold,
			totalWeight: 3,
			currentWeight,
			hasReachedThreshold: currentWeight >= threshold,
			members: [],
		});
		expect(
			getProgressSignerSet([
				set('0xa', 1, 3),
				set('0xb', 1, 2),
			])?.address,
		).toBe('0xb');
		expect(
			getProgressSignerSet([
				set('0xa', 1, 2),
				set('0xb', 2, 2),
			])?.address,
		).toBe('0xb');
	});

	test('combines only the signatures of the set that reached its threshold', async () => {
		// Carol signed too, but she is only in the first set, which is
		// short of its threshold.
		const signatures = await Promise.all([
			signatureOf(1, carol),
			signatureOf(1, bob),
			signatureOf(1, alice),
		]);
		const proposal = { signatures };
		const signerSets = [
			tallySignerSet(
				proposal,
				signerSet('0xa', 3, [
					carol,
					alice,
					Ed25519Keypair.generate(),
				]),
			),
			tallySignerSet(
				proposal,
				signerSet('0xb', 2, [alice, bob]),
			),
		];

		const { signerSet: used, multiSigPublicKey } =
			combineProposalSignatures({
				signatures,
				signerSets,
			});

		expect(used.address).toBe('0xb');
		expect(multiSigPublicKey.toSuiAddress()).toBe(
			MultiSigPublicKey.fromPublicKeys({
				threshold: 2,
				publicKeys: [alice, bob].map((k) => ({
					publicKey: k.getPublicKey(),
					weight: 1,
				})),
			}).toSuiAddress(),
		);
	});

	test('refuses to combine before any set reaches its threshold', async () => {
		const proposal = {
			signatures: [await signatureOf(1, alice)],
		};
		expect(() =>
			combineProposalSignatures({
				...proposal,
				signerSets: [
					tallySignerSet(
						proposal,
						signerSet('0xa', 2, [alice, bob]),
					),
				],
			}),
		).toThrow('No signer set has reached its threshold');
	});
});
