// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, test } from 'vitest';

import {
	checkSigners,
	thresholdBar,
	thresholdWarning,
	type SignerDraft,
} from '../src/lib/create-multisig';

const key = () =>
	new Ed25519Keypair().getPublicKey().toSuiPublicKey();

const signer = (
	id: string,
	changes: Partial<SignerDraft> = {},
): SignerDraft => ({
	id,
	label: '',
	key: key(),
	weight: 1,
	...changes,
});

describe('threshold warnings', () => {
	test('one signer who can approve alone', () => {
		expect(
			thresholdWarning({
				signers: [
					{ name: 'Maya', weight: 255 },
					{ name: 'Alice', weight: 1 },
				],
				threshold: 4,
				totalWeight: 256,
			}),
		).toBe(
			'Maya can approve proposals alone. Maya’s weight (255) is at or above the threshold (4). Lower Maya’s weight below 4, or raise the threshold above 255.',
		);
	});

	test('several signers, named with "or"', () => {
		expect(
			thresholdWarning({
				signers: [
					{ name: 'Maya', weight: 2 },
					{ name: 'Daniel', weight: 2 },
					{ name: 'Alice', weight: 1 },
				],
				threshold: 2,
				totalWeight: 5,
			}),
		).toBe(
			'Maya or Daniel can approve proposals alone. Raise the threshold to 3 or more so every proposal needs at least two signers.',
		);
	});

	test('every signer must sign, and nothing below that', () => {
		const signers = [1, 1, 1].map((weight) => ({
			name: 'x',
			weight,
		}));
		expect(
			thresholdWarning({
				signers,
				threshold: 3,
				totalWeight: 3,
			}),
		).toMatch(/^Every signer must sign/);
		expect(
			thresholdWarning({
				signers,
				threshold: 2,
				totalWeight: 3,
			}),
		).toBeNull();
	});
});

describe('threshold bar', () => {
	test('a segment per weight up to 10', () => {
		expect(thresholdBar(4, 7)).toEqual({
			kind: 'segments',
			filled: [true, true, true, true, false, false, false],
		});
	});

	test('a continuous bar above 10 that stays visible', () => {
		expect(thresholdBar(4, 260)).toEqual({
			kind: 'continuous',
			percent: 4,
		});
		expect(thresholdBar(130, 260)).toEqual({
			kind: 'continuous',
			percent: 50,
		});
	});
});

describe('signer checks', () => {
	test('blank, invalid and duplicate rows hold Continue and drop out of the totals', () => {
		const daniel = signer('2', {
			label: 'Daniel',
			weight: 2,
		});
		const check = checkSigners({
			signers: [
				signer('1', { isCreator: true }),
				daniel,
				signer('3', { key: '' }),
				signer('4', { key: 'AGx9Q2mT7vR4kLpZ' }),
				signer('5', { key: daniel.key }),
			],
			threshold: 1,
			lookups: {},
			creatorName: 'Maya',
		});
		expect(check.completeCount).toBe(2);
		expect(check.incompleteCount).toBe(3);
		expect(check.totalWeight).toBe(3);
		expect(check.canContinue).toBe(false);
		expect(check.address).toBeNull();
		expect(check.blockedMessage).toBe(
			'Finish or remove signers 3, 4 and 5 to continue.',
		);
		expect(check.signers[4].status).toEqual({
			kind: 'error',
			message:
				'Daniel (signer 2) already uses this key. Each signer needs their own key.',
		});
	});

	test('an address with no key on record asks for one', () => {
		const address = `0x${'ab'.repeat(32)}`;
		const check = checkSigners({
			signers: [
				signer('1', { isCreator: true }),
				signer('2', { label: 'Leon', key: address }),
			],
			threshold: 1,
			lookups: { [address]: { kind: 'missing' } },
			creatorName: null,
		});
		expect(check.signers[1].status).toEqual({
			kind: 'no-key',
			message:
				'No public key found for this address. It hasn’t signed a transaction yet. Ask Leon for their public key.',
		});
		expect(check.blockedMessage).toBe(
			'Add a public key for signer 2, or remove the row, to continue.',
		);
	});

	test('the creator alone cannot continue, with no helper text', () => {
		const check = checkSigners({
			signers: [signer('1', { isCreator: true })],
			threshold: 1,
			lookups: {},
			creatorName: null,
		});
		expect(check.tooFewSigners).toBe(true);
		expect(check.canContinue).toBe(false);
		expect(check.blockedMessage).toBeNull();
		expect(check.warning).toBeNull();
	});
});
