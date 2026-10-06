// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { TransactionError } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import {
	afterAll,
	describe,
	expect,
	spyOn,
	test,
} from 'bun:test';

import {
	hasExpired,
	keepsHistorySince,
	whyInvalid,
} from '../src/services/proposal-status.service';
import * as client from '../src/utils/client';

// Epoch 10 started at time 1000.
const now = {
	epoch: '10',
	epochStartTimestampMs: '1000',
};

const window: {
	minEpoch: string | null;
	maxEpoch: string | null;
	minTimestamp: string | null;
	maxTimestamp: string | null;
	chain: string;
	nonce: number;
} = {
	minEpoch: null,
	maxEpoch: null,
	minTimestamp: null,
	maxTimestamp: null,
	chain: '',
	nonce: 0,
};

describe('hasExpired', () => {
	test('a transaction without an expiration never expires', () => {
		expect(hasExpired(null, now)).toBe(false);
		expect(
			hasExpired({ $kind: 'None', None: true }, now),
		).toBe(false);
	});

	test('an epoch expiration passes once that epoch is over', () => {
		expect(
			hasExpired({ $kind: 'Epoch', Epoch: '10' }, now),
		).toBe(false);
		expect(
			hasExpired({ $kind: 'Epoch', Epoch: '9' }, now),
		).toBe(true);
	});

	for (const $kind of [
		'ValidDuring',
		'Validity',
	] as const) {
		const expiration = (
			bounds: Partial<typeof window>,
		): Parameters<typeof hasExpired>[0] =>
			$kind === 'ValidDuring'
				? { $kind, ValidDuring: { ...window, ...bounds } }
				: {
						$kind,
						Validity: {
							...window,
							...bounds,
							allowedProposers: null,
						},
					};

		test(`a ${$kind} expiration passes once its last epoch is over`, () => {
			expect(
				hasExpired(expiration({ maxEpoch: '10' }), now),
			).toBe(false);
			expect(
				hasExpired(expiration({ maxEpoch: '9' }), now),
			).toBe(true);
		});

		test(`a ${$kind} expiration passes once its latest time is before the current epoch`, () => {
			expect(
				hasExpired(
					expiration({ maxTimestamp: '1000' }),
					now,
				),
			).toBe(false);
			expect(
				hasExpired(
					expiration({ maxTimestamp: '999' }),
					now,
				),
			).toBe(true);
		});

		test(`a ${$kind} expiration that hasn't started yet hasn't expired`, () => {
			expect(
				hasExpired(
					expiration({ minEpoch: '11', maxEpoch: '12' }),
					now,
				),
			).toBe(false);
		});
	}
});

describe('whyInvalid', () => {
	const chainInfo = {
		systemState: now,
		chainIdentifier: 'this-network',
	};

	const boundTo = (
		$kind: 'ValidDuring' | 'Validity',
		chain: string,
	) => {
		const bounds = {
			...window,
			minEpoch: '10',
			maxEpoch: '11',
			chain,
		};
		const tx = new Transaction();
		tx.setExpiration(
			$kind === 'ValidDuring'
				? { ValidDuring: bounds }
				: {
						Validity: { ...bounds, allowedProposers: null },
					},
		);
		return tx;
	};

	for (const $kind of [
		'ValidDuring',
		'Validity',
	] as const) {
		test(`a ${$kind} transaction for another network can never execute`, () => {
			expect(
				whyInvalid(
					boundTo($kind, 'another-network'),
					chainInfo,
				),
			).toBe('it is for another network');
		});

		test(`a ${$kind} transaction for this network still can`, () => {
			expect(
				whyInvalid(
					boundTo($kind, 'this-network'),
					chainInfo,
				),
			).toBeNull();
		});
	}
});

describe('keepsHistorySince', () => {
	const proposedAt = new Date('2026-10-01T00:00:00Z');

	// When the node's oldest checkpoint was made, or null once it's gone.
	let oldestCheckpointAt: Date | null = null;
	const checkpointTimestamp = spyOn(
		client,
		'getCheckpointTimestamp',
	).mockImplementation(async () => {
		if (!oldestCheckpointAt)
			throw new Error('Checkpoint not found');
		return oldestCheckpointAt.getTime();
	});
	afterAll(() => checkpointTimestamp.mockRestore());

	// The error a node sends when it can't find a transaction.
	const notFound = new TransactionError(
		'notFound',
		'digest',
		{
			cause: {
				meta: {
					'x-sui-lowest-available-checkpoint': '1000',
				},
			},
		},
	);

	test('a node with history from before the proposal keeps it', async () => {
		oldestCheckpointAt = new Date('2026-09-20T00:00:00Z');
		expect(
			await keepsHistorySince(
				'mainnet',
				notFound,
				proposedAt,
			),
		).toBe(true);
	});

	test('a node that pruned past the proposal does not', async () => {
		oldestCheckpointAt = new Date('2026-10-02T00:00:00Z');
		expect(
			await keepsHistorySince(
				'mainnet',
				notFound,
				proposedAt,
			),
		).toBe(false);
	});

	test('a node whose oldest checkpoint is gone proves nothing', async () => {
		oldestCheckpointAt = null;
		expect(
			await keepsHistorySince(
				'mainnet',
				notFound,
				proposedAt,
			),
		).toBe(false);
	});

	test('an error without the header proves nothing', async () => {
		oldestCheckpointAt = new Date('2026-09-20T00:00:00Z');
		expect(
			await keepsHistorySince(
				'mainnet',
				new TransactionError('notFound', 'digest'),
				proposedAt,
			),
		).toBe(false);
	});
});

describe('getCheckpointTimestamp', () => {
	test('keeps the milliseconds, rounded up', async () => {
		const getCheckpoint = spyOn(
			client.getSuiClient('localnet').ledgerService,
			'getCheckpoint',
		).mockResolvedValue({
			response: {
				checkpoint: {
					summary: {
						timestamp: {
							seconds: 1000n,
							nanos: 500_000_001,
						},
					},
				},
			},
		} as never);
		try {
			expect(
				await client.getCheckpointTimestamp('localnet', 1n),
			).toBe(1_000_501);
		} finally {
			getCheckpoint.mockRestore();
		}
	});
});
