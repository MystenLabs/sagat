// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { formatAddress } from '@mysten/sui/utils';
import { describe, expect, test } from 'vitest';

import {
	rejectionNotice,
	signerRows,
	signerSetStatus,
	signerSummary,
} from '../src/lib/signers';

const member = (
	weight: number,
	status: 'accepted' | 'rejected' | 'pending',
) => ({
	weight,
	isAccepted: status === 'accepted',
	isRejected: status === 'rejected',
});

describe('signer set status', () => {
	test('counts each invitation status once', () => {
		expect(
			signerSetStatus(
				[
					member(2, 'accepted'),
					member(1, 'rejected'),
					member(1, 'pending'),
				],
				2,
			),
		).toEqual({
			total: 3,
			accepted: 1,
			rejected: 1,
			pending: 1,
			canReachThreshold: true,
		});
	});

	test('the threshold is out of reach once the rejected weight leaves too little', () => {
		expect(
			signerSetStatus(
				[
					member(2, 'accepted'),
					member(2, 'rejected'),
					member(1, 'rejected'),
				],
				4,
			).canReachThreshold,
		).toBe(false);
	});

	test('an accept wins over a reject on the same key', () => {
		const status = signerSetStatus(
			[{ weight: 1, isAccepted: true, isRejected: true }],
			1,
		);
		expect(status.accepted).toBe(1);
		expect(status.rejected).toBe(0);
	});
});

describe('signer summary', () => {
	const all = (n: number) =>
		Array.from({ length: n }, () => member(1, 'accepted'));

	test('says when everyone accepted', () => {
		expect(
			signerSummary(signerSetStatus(all(5), 1), []),
		).toBe('All 5 accepted');
		expect(
			signerSummary(signerSetStatus(all(2), 1), []),
		).toBe('Both accepted');
	});

	test('counts acceptances while invitations are open', () => {
		expect(
			signerSummary(
				signerSetStatus(
					[
						...all(3),
						member(1, 'pending'),
						member(1, 'pending'),
					],
					1,
				),
				[],
			),
		).toBe('3 of 5 accepted');
	});

	test('names one rejected signer, counts several', () => {
		expect(
			signerSummary(
				signerSetStatus(
					[...all(4), member(1, 'rejected')],
					1,
				),
				['Hana'],
			),
		).toBe('4 of 5 accepted · Hana rejected');
		expect(
			signerSummary(
				signerSetStatus(
					[
						...all(2),
						member(1, 'rejected'),
						member(1, 'rejected'),
						member(1, 'rejected'),
					],
					1,
				),
				['Daniel', 'Tomás', 'Hana'],
			),
		).toBe('2 of 5 accepted · 3 rejected');
	});
});

describe('rejection notice', () => {
	test('nothing while nobody rejected', () => {
		expect(
			rejectionNotice(
				signerSetStatus(
					[member(1, 'accepted'), member(1, 'pending')],
					2,
				),
				[],
			),
		).toBeNull();
	});

	test('a warning while the others can still reach the threshold', () => {
		expect(
			rejectionNotice(
				signerSetStatus(
					[
						member(2, 'accepted'),
						member(2, 'accepted'),
						member(1, 'rejected'),
					],
					4,
				),
				['Hana'],
			),
		).toEqual({
			tone: 'warning',
			message:
				'Hana rejected the invitation to join this account. The other signers can still reach the threshold.',
		});
	});

	test('an error once the rest cannot reach the threshold', () => {
		expect(
			rejectionNotice(
				signerSetStatus(
					[
						member(2, 'accepted'),
						member(2, 'rejected'),
						member(1, 'accepted'),
						member(1, 'rejected'),
						member(1, 'rejected'),
					],
					4,
				),
				['Daniel', 'Tomás', 'Hana'],
			),
		).toEqual({
			tone: 'error',
			message:
				'3 signers rejected their invitations to join this account. The rest can’t reach the threshold, so this account can’t move funds.',
		});
	});
});

describe('signer rows', () => {
	const key = () => {
		const publicKey = new Ed25519Keypair().getPublicKey();
		return {
			publicKey: publicKey.toSuiPublicKey(),
			address: publicKey.toSuiAddress(),
		};
	};
	const row = (
		publicKey: string,
		order: number,
		label: string | null,
	) => ({
		multisigAddress: '0x1',
		publicKey,
		weight: 1,
		isAccepted: false,
		isRejected: false,
		order,
		label,
	});

	test('sorts by order and names, marks you and the creator', () => {
		const alice = key();
		const bob = key();
		const rows = signerRows(
			[
				row(bob.publicKey, 1, null),
				row(alice.publicKey, 0, 'Alice'),
			],
			bob.address,
			alice.address,
		);
		expect(
			rows.map(({ address, name, isYou, isCreator }) => ({
				address,
				name,
				isYou,
				isCreator,
			})),
		).toEqual([
			{
				address: alice.address,
				name: 'Alice',
				isYou: false,
				isCreator: true,
			},
			{
				address: bob.address,
				name: formatAddress(bob.address),
				isYou: true,
				isCreator: false,
			},
		]);
	});

	test('marks no creator when the account does not know it', () => {
		const alice = key();
		const [only] = signerRows(
			[row(alice.publicKey, 0, null)],
			null,
		);
		expect(only.isCreator).toBe(false);
		expect(only.isYou).toBe(false);
	});

	test('names a key it cannot read', () => {
		const [only] = signerRows(
			[row('not-a-key', 0, null)],
			undefined,
			undefined,
		);
		expect(only.address).toBeUndefined();
		expect(only.name).toBe('Unknown key');
		expect(only.isYou).toBe(false);
		expect(only.isCreator).toBe(false);
	});
});
