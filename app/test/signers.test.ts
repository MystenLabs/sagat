// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import {
	rejectionNotice,
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
