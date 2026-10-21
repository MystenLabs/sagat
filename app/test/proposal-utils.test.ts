// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	type ProposalSignature,
	type ProposalSignerSet,
} from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { describe, expect, test } from 'vitest';

import {
	combineProposalSignatures,
	describeProgress,
	executedViaName,
	getExecutingSignerSet,
	getProgressSignerSet,
	isReadyToExecute,
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

// A signer set as the server returns it on a proposal: tallied against
// `signatures`, which is the server's job, not the app's.
const tallied = (
	address: string,
	threshold: number,
	keypairs: Ed25519Keypair[],
	signatures: ProposalSignature[],
	label: string | null = null,
): ProposalSignerSet => {
	const members = keypairs.map((keypair, order) => ({
		publicKey: keyOf(keypair),
		weight: 1,
		order,
		hasSigned: signatures.some(
			(s) => s.publicKey === keyOf(keypair),
		),
	}));
	const currentWeight = members.filter(
		(m) => m.hasSigned,
	).length;
	return {
		address,
		label,
		threshold,
		totalWeight: members.length,
		currentWeight,
		hasReachedThreshold: currentWeight >= threshold,
		members,
	};
};

const progressOf = (
	address: string,
	currentWeight: number,
	threshold: number,
	label: string | null = null,
): ProposalSignerSet => ({
	address,
	label,
	threshold,
	totalWeight: 3,
	currentWeight,
	hasReachedThreshold: currentWeight >= threshold,
	members: [],
});

describe('proposal utils', () => {
	test('shows the set that can execute, else the closest one', () => {
		expect(
			getProgressSignerSet([
				progressOf('0xa', 1, 3),
				progressOf('0xb', 1, 2),
			])?.address,
		).toBe('0xb');
		expect(
			getProgressSignerSet([
				progressOf('0xa', 1, 2),
				progressOf('0xb', 2, 2),
			])?.address,
		).toBe('0xb');
	});

	test('is ready once any valid set reached its threshold', () => {
		const sets = [
			progressOf('0xa', 1, 3),
			progressOf('0xb', 2, 2),
		];
		expect(isReadyToExecute(sets)).toBe(true);
		expect(getExecutingSignerSet(sets)?.address).toBe(
			'0xb',
		);
		expect(
			isReadyToExecute([progressOf('0xa', 2, 3)]),
		).toBe(false);
		// No set valid on the proposal's network: nothing can execute it.
		expect(isReadyToExecute([])).toBe(false);
	});

	test('describes one set as before, several per set', () => {
		expect(
			describeProgress([progressOf('0xa', 1, 2)]),
		).toBe('1/2');
		expect(
			describeProgress([
				progressOf('0xa', 1, 4, 'Board'),
				progressOf('0xb', 2, 3, 'Operations'),
			]),
		).toBe('2 of 3 via Operations, 1 of 4 via Board');
		expect(describeProgress([])).toBeNull();
	});

	test('names the set a proposal was executed via', () => {
		const ops = `0x${'a'.repeat(64)}`;
		const retired = `0x${'b'.repeat(64)}`;
		const unknown = `0x${'c'.repeat(64)}`;
		const signerSets = [
			progressOf(ops, 2, 2, 'Operations'),
		];
		expect(
			executedViaName({ executedVia: null, signerSets }),
		).toBeNull();
		expect(
			executedViaName({ executedVia: ops, signerSets }),
		).toBe('Operations');
		// No longer valid on the network: the account still names it.
		expect(
			executedViaName(
				{ executedVia: retired, signerSets },
				[{ address: retired, label: 'Original' }],
			),
		).toBe('Original');
		expect(
			executedViaName({ executedVia: unknown, signerSets }),
		).toBe('0xcccc…cccc');
	});

	test('combines only the signatures of the set that reached its threshold', async () => {
		// Carol signed too, but she is only in the first set, which is
		// short of its threshold.
		const signatures = await Promise.all([
			signatureOf(1, carol),
			signatureOf(1, bob),
			signatureOf(1, alice),
		]);
		const signerSets = [
			tallied(
				'0xa',
				3,
				[carol, alice, Ed25519Keypair.generate()],
				signatures,
			),
			tallied('0xb', 2, [alice, bob], signatures),
		];

		const [, bobSignature, aliceSignature] = signatures;
		expect(
			combineProposalSignatures({ signatures, signerSets }),
		).toBe(
			MultiSigPublicKey.fromPublicKeys({
				threshold: 2,
				publicKeys: [alice, bob].map((k) => ({
					publicKey: k.getPublicKey(),
					weight: 1,
				})),
			}).combinePartialSignatures([
				aliceSignature.signature,
				bobSignature.signature,
			]),
		);
	});

	test('uses the server tally, not the signatures, to pick the set', async () => {
		// The server dropped bob's set (retired on this network), so his
		// signature is kept but counts nowhere.
		const signatures = await Promise.all([
			signatureOf(1, alice),
			signatureOf(1, bob),
		]);
		expect(() =>
			combineProposalSignatures({
				signatures,
				signerSets: [
					tallied('0xa', 2, [alice, carol], signatures),
				],
			}),
		).toThrow('No signer set has reached its threshold');
	});

	test('refuses to combine before any set reaches its threshold', async () => {
		const signatures = [await signatureOf(1, alice)];
		expect(() =>
			combineProposalSignatures({
				signatures,
				signerSets: [
					tallied('0xa', 2, [alice, bob], signatures),
				],
			}),
		).toThrow('No signer set has reached its threshold');
	});
});
