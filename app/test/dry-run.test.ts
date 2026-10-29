// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { RpcError } from '@mysten/sui/grpc';
import { describe, expect, test } from 'vitest';

import {
	couldNotSimulate,
	SimulationFailedError,
} from '../src/hooks/useDryRun';

describe('couldNotSimulate', () => {
	test('a failed simulation is a verdict', () => {
		expect(
			couldNotSimulate(
				new SimulationFailedError('MoveAbort'),
			),
		).toBe(false);
	});

	test('a refused code is a verdict', () => {
		expect(
			couldNotSimulate(
				new RpcError(
					'Object not found',
					'INVALID_ARGUMENT',
				),
			),
		).toBe(false);
	});

	test('an expired refusal is a verdict, not an unreachable node', () => {
		expect(
			couldNotSimulate(
				new RpcError('Transaction Expired', 'INTERNAL'),
			),
		).toBe(false);
	});

	test('an unreachable node could not simulate', () => {
		expect(
			couldNotSimulate(
				new RpcError(
					'Unable to connect. Is the computer able to access the url?',
					'INTERNAL',
				),
			),
		).toBe(true);
	});

	test('a plain Error could not simulate', () => {
		expect(
			couldNotSimulate(new Error('Failed to fetch')),
		).toBe(true);
	});
});
