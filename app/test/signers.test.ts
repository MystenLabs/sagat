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

let order = 0;
const member = (
	weight: number,
	status: 'accepted' | 'rejected' | 'pending',
	label: string | null = null,
) => ({
	multisigAddress: '0x1',
	publicKey: new Ed25519Keypair()
		.getPublicKey()
		.toSuiPublicKey(),
	weight,
	isAccepted: status === 'accepted',
	isRejected: status === 'rejected',
	order: order++,
	label,
});

/** The status of a set, through the rows the screens build. */
const setStatus = (
	members: ReturnType<typeof member>[],
	threshold: number,
) => signerSetStatus(signerRows(members, null), threshold);

describe('signer set status', () => {
	test('counts each invitation status once', () => {
		expect(
			setStatus(
				[
					member(2, 'accepted'),
					member(1, 'rejected', 'Hana'),
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
			rejectedNames: ['Hana'],
		});
	});

	test('the threshold is out of reach once the rejected weight leaves too little', () => {
		expect(
			setStatus(
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
		const status = setStatus(
			[{ ...member(1, 'accepted'), isRejected: true }],
			1,
		);
		expect(status.accepted).toBe(1);
		expect(status.rejected).toBe(0);
		expect(status.rejectedNames).toEqual([]);
	});

	test('names the rejected signers in row order', () => {
		const daniel = member(1, 'rejected', 'Daniel');
		const accepted = member(1, 'accepted');
		const unnamed = member(1, 'rejected');
		const hana = member(1, 'rejected', 'Hana');
		const rows = signerRows(
			[hana, unnamed, accepted, daniel],
			null,
		);
		expect(signerSetStatus(rows, 1).rejectedNames).toEqual([
			'Daniel',
			rows[2].name,
			'Hana',
		]);
	});
});

describe('signer summary', () => {
	const all = (n: number) =>
		Array.from({ length: n }, () => member(1, 'accepted'));

	test('says when everyone accepted', () => {
		expect(signerSummary(setStatus(all(5), 1))).toBe(
			'All 5 accepted',
		);
		expect(signerSummary(setStatus(all(2), 1))).toBe(
			'Both accepted',
		);
	});

	test('counts acceptances while invitations are open', () => {
		expect(
			signerSummary(
				setStatus(
					[
						...all(3),
						member(1, 'pending'),
						member(1, 'pending'),
					],
					1,
				),
			),
		).toBe('3 of 5 accepted');
	});

	test('names one rejected signer, counts several', () => {
		expect(
			signerSummary(
				setStatus(
					[...all(4), member(1, 'rejected', 'Hana')],
					1,
				),
			),
		).toBe('4 of 5 accepted · Hana rejected');
		expect(
			signerSummary(
				setStatus(
					[
						...all(2),
						member(1, 'rejected', 'Daniel'),
						member(1, 'rejected', 'Tomás'),
						member(1, 'rejected', 'Hana'),
					],
					1,
				),
			),
		).toBe('2 of 5 accepted · 3 rejected');
	});
});

describe('rejection notice', () => {
	test('nothing while nobody rejected', () => {
		expect(
			rejectionNotice(
				setStatus(
					[member(1, 'accepted'), member(1, 'pending')],
					2,
				),
			),
		).toBeNull();
	});

	test('a warning while the others can still reach the threshold', () => {
		expect(
			rejectionNotice(
				setStatus(
					[
						member(2, 'accepted'),
						member(2, 'accepted'),
						member(1, 'rejected', 'Hana'),
					],
					4,
				),
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
				setStatus(
					[
						member(2, 'accepted'),
						member(2, 'rejected', 'Daniel'),
						member(1, 'accepted'),
						member(1, 'rejected', 'Tomás'),
						member(1, 'rejected', 'Hana'),
					],
					4,
				),
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
