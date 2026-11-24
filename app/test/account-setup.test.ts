// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, test } from 'vitest';

import { accountSetup } from '../src/lib/account-setup';
import { formatDateTime } from '../src/lib/dates';

const key = () => {
	const keypair = new Ed25519Keypair();
	return {
		address: keypair.toSuiAddress(),
		publicKey: keypair.getPublicKey().toSuiPublicKey(),
	};
};

const ACCOUNT = `0x${'ab'.repeat(32)}`;
const alice = key();
const bob = key();

const multisig = ({
	createdBy = alice.address,
	createdAt = '2026-09-02T10:42:00.000Z',
}: {
	createdBy?: string;
	createdAt?: string;
} = {}) => {
	const set = {
		address: ACCOUNT,
		threshold: 2,
		members: [
			{ key: alice, label: 'Alice', weight: 2 },
			{ key: bob, label: null, weight: 1 },
		].map(({ key, label, weight }, order) => ({
			publicKey: key.publicKey,
			weight,
			answer: 'accepted' as const,
			order,
			label,
		})),
	};
	return {
		address: ACCOUNT,
		createdBy,
		createdAt,
		signerSets: [
			{ kind: 'signer_set' as const, ...set, acting: true },
		],
		threshold: set.threshold,
		members: set.members,
	};
};

describe('account setup', () => {
	test('sums the account up, with the threshold as a number and a label', () => {
		const createdAt = '2026-09-02T10:42:00.000Z';
		expect(
			accountSetup({
				multisig: multisig({ createdAt }),
				currentAddress: bob.address,
			}),
		).toEqual({
			threshold: 2,
			thresholdLabel: '2 of 3',
			signerCount: 2,
			totalWeight: 3,
			createdAt,
			createdLabel: formatDateTime(createdAt),
			creator: {
				address: alice.address,
				label: 'Alice',
				isYou: false,
			},
		});
	});

	test('marks the creator as you when the signed-in key created it', () => {
		expect(
			accountSetup({
				multisig: multisig(),
				currentAddress: alice.address,
			}).creator?.isYou,
		).toBe(true);
	});

	test('names an unlabelled creator by address alone', () => {
		expect(
			accountSetup({
				multisig: multisig({ createdBy: bob.address }),
				currentAddress: null,
			}).creator,
		).toEqual({
			address: bob.address,
			label: null,
			isYou: false,
		});
	});

	test('has no creator when the API does not know it', () => {
		// Accounts from before the rotation carry their own address.
		expect(
			accountSetup({
				multisig: multisig({ createdBy: ACCOUNT }),
				currentAddress: alice.address,
			}).creator,
		).toBeNull();
	});

	test('leaves the creation time empty when unknown', () => {
		// The only unknown time `/v1` serves: a pre-migration pod, stamped with the migration's run.
		const setup = accountSetup({
			multisig: multisig({
				createdBy: ACCOUNT,
				createdAt: '2026-11-01T03:00:00.000Z',
			}),
			currentAddress: undefined,
		});
		expect(setup.createdAt).toBeNull();
		expect(setup.createdLabel).toBeNull();
	});

	test('leaves the creation time empty for accounts from before the rotation', () => {
		// The migration stamped them with its own run time.
		const setup = accountSetup({
			multisig: multisig({ createdBy: ACCOUNT }),
			currentAddress: alice.address,
		});
		expect(setup.createdAt).toBeNull();
		expect(setup.createdLabel).toBeNull();
	});
});
