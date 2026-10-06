// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { TransactionError } from '@mysten/sui/client';
import {
	afterAll,
	describe,
	expect,
	spyOn,
	test,
} from 'bun:test';

import {
	hasMoved,
	keepsHistorySince,
} from '../src/services/proposal-status.service';
import * as client from '../src/utils/client';

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
