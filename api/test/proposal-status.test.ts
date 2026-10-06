// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { TransactionError } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import {
	afterAll,
	beforeAll,
	describe,
	expect,
	spyOn,
	test,
} from 'bun:test';

import {
	hasExpired,
	hasMoved,
	provesNeverExecuted,
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

describe('provesNeverExecuted', () => {
	const proposedAt = new Date('2026-10-01T00:00:00Z');
	const dayBefore = new Date('2026-09-30T00:00:00Z');

	// When the node's oldest checkpoint was made, or null once it's gone.
	let oldestCheckpointAt: Date | null = null;
	let checkpointTimestamp: ReturnType<typeof spyOn>;
	beforeAll(() => {
		checkpointTimestamp = spyOn(
			client,
			'getCheckpointTimestamp',
		).mockImplementation(async () => {
			if (!oldestCheckpointAt)
				throw new Error('Checkpoint not found');
			return oldestCheckpointAt.getTime();
		});
	});
	afterAll(() => checkpointTimestamp.mockRestore());

	// The error a node in epoch 20 sends when it can't find a transaction.
	const notFound = (meta: Record<string, string>) =>
		new TransactionError('notFound', 'digest', {
			cause: { meta },
		});
	const fromNode = notFound({
		'x-sui-lowest-available-checkpoint': '1000',
		'x-sui-epoch': '20',
	});

	test('a node with history from well before the proposal proves it', async () => {
		oldestCheckpointAt = new Date('2026-09-20T00:00:00Z');
		expect(
			await provesNeverExecuted(
				'mainnet',
				fromNode,
				proposedAt,
				null,
			),
		).toBe(true);
	});

	test('a node whose history starts less than a day before the proposal does not', async () => {
		oldestCheckpointAt = new Date('2026-09-30T12:00:00Z');
		expect(
			await provesNeverExecuted(
				'mainnet',
				fromNode,
				proposedAt,
				null,
			),
		).toBe(false);
		expect(
			await provesNeverExecuted(
				'mainnet',
				fromNode,
				dayBefore,
				null,
			),
		).toBe(false);
	});

	test('a node that pruned past the proposal does not', async () => {
		oldestCheckpointAt = new Date('2026-10-02T00:00:00Z');
		expect(
			await provesNeverExecuted(
				'mainnet',
				fromNode,
				proposedAt,
				null,
			),
		).toBe(false);
	});

	test('a node still in the last epoch the transaction could run in does not', async () => {
		oldestCheckpointAt = new Date('2026-09-20T00:00:00Z');
		expect(
			await provesNeverExecuted(
				'mainnet',
				fromNode,
				proposedAt,
				20n,
			),
		).toBe(false);
		expect(
			await provesNeverExecuted(
				'mainnet',
				fromNode,
				proposedAt,
				19n,
			),
		).toBe(true);
	});

	test('a node whose oldest checkpoint is gone proves nothing', async () => {
		oldestCheckpointAt = null;
		expect(
			await provesNeverExecuted(
				'mainnet',
				fromNode,
				proposedAt,
				null,
			),
		).toBe(false);
	});

	test('an error without the headers proves nothing', async () => {
		oldestCheckpointAt = new Date('2026-09-20T00:00:00Z');
		expect(
			await provesNeverExecuted(
				'mainnet',
				new TransactionError('notFound', 'digest'),
				proposedAt,
				null,
			),
		).toBe(false);
		expect(
			await provesNeverExecuted(
				'mainnet',
				notFound({
					'x-sui-lowest-available-checkpoint': '1000',
				}),
				proposedAt,
				19n,
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

describe('hasMoved', () => {
	const pinned = {
		objectId: '0x1',
		version: '10',
		digest: '',
	};

	test('an object at a newer version has moved', () => {
		expect(hasMoved(pinned, '11')).toBe(true);
	});

	test('an object at the pinned version has not moved', () => {
		expect(hasMoved(pinned, '10')).toBe(false);
	});

	test('an older version only means the node is behind', () => {
		expect(hasMoved(pinned, '9')).toBe(false);
	});

	test('a missing object proves nothing', () => {
		expect(hasMoved(pinned, null)).toBe(false);
		expect(hasMoved(pinned, undefined)).toBe(false);
	});
});
