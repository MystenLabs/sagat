// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { formatAddress } from '@mysten/sui/utils';
import { describe, expect, test } from 'vitest';

import { accountStatus } from '../src/lib/account-status';

type Status = 'accepted' | 'rejected' | 'pending';

const signer = (
	status: Status,
	{
		label = null,
		weight = 1,
	}: { label?: string | null; weight?: number } = {},
) => {
	const keypair = new Ed25519Keypair();
	return {
		multisigAddress: '0x1',
		order: 0,
		address: keypair.toSuiAddress(),
		publicKey: keypair.getPublicKey().toSuiPublicKey(),
		label,
		weight,
		isAccepted: status === 'accepted',
		isRejected: status === 'rejected',
	};
};

describe('account status', () => {
	test('is healthy while nobody rejected, even with invitations pending', () => {
		expect(
			accountStatus({
				members: [signer('accepted'), signer('pending')],
				threshold: 2,
			}),
		).toEqual({ tone: 'ok' });
	});

	test('names a single rejected signer by label while the rest can still reach the threshold', () => {
		expect(
			accountStatus({
				members: [
					signer('accepted', { label: 'Alice' }),
					signer('pending', { label: 'Bob' }),
					signer('rejected', { label: 'Hana' }),
				],
				threshold: 2,
			}),
		).toEqual({
			tone: 'warning',
			message: 'Hana rejected the invitation.',
		});
	});

	test('falls back to the short address for an unlabelled signer', () => {
		const hana = signer('rejected');
		expect(
			accountStatus({
				members: [signer('accepted'), hana],
				threshold: 1,
			}),
		).toEqual({
			tone: 'warning',
			message: `${formatAddress(hana.address)} rejected the invitation.`,
		});
	});

	test('a key that will not parse is "Unknown key"', () => {
		expect(
			accountStatus({
				members: [
					signer('accepted'),
					{ ...signer('rejected'), publicKey: 'not-a-key' },
				],
				threshold: 1,
			}),
		).toEqual({
			tone: 'warning',
			message: 'Unknown key rejected the invitation.',
		});
	});

	test('counts several rejections', () => {
		expect(
			accountStatus({
				members: [
					signer('accepted'),
					signer('accepted'),
					signer('rejected'),
					signer('rejected'),
				],
				threshold: 2,
			}),
		).toEqual({
			tone: 'warning',
			message: '2 signers rejected their invitations.',
		});
	});

	test('is an error once the remaining weight is below the threshold', () => {
		expect(
			accountStatus({
				members: [
					signer('accepted'),
					signer('rejected'),
					signer('rejected'),
					signer('rejected'),
				],
				threshold: 3,
			}),
		).toEqual({
			tone: 'error',
			message:
				'3 signers rejected, and the threshold needs them.',
		});
		expect(
			accountStatus({
				members: [signer('accepted'), signer('rejected')],
				threshold: 2,
			}),
		).toEqual({
			tone: 'error',
			message:
				'1 signer rejected, and the threshold needs them.',
		});
	});

	test('weighs signers, so one heavy rejection can block the account', () => {
		expect(
			accountStatus({
				members: [
					signer('accepted', { weight: 1 }),
					signer('pending', { weight: 1 }),
					signer('rejected', { weight: 3, label: 'Hana' }),
				],
				threshold: 3,
			}),
		).toEqual({
			tone: 'error',
			message:
				'1 signer rejected, and the threshold needs them.',
		});
	});

	test('an accept wins over a reject, like everywhere else', () => {
		const both = {
			...signer('accepted'),
			isRejected: true,
		};
		expect(
			accountStatus({ members: [both], threshold: 1 }),
		).toEqual({ tone: 'ok' });
	});
});
