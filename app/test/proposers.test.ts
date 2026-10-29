// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	formatAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import { describe, expect, test } from 'vitest';

import { addedByName } from '../src/lib/proposers';

const MAYA = normalizeSuiAddress('0xa1');
const DANIEL = normalizeSuiAddress('0xb2');
const labels = new Map<string, string | null>([
	[MAYA, 'Maya'],
	[DANIEL, null],
]);

describe('addedByName', () => {
	test('names a member by their key label', () => {
		expect(addedByName(MAYA, labels, undefined)).toBe(
			'Maya',
		);
	});

	test('falls back to the short address without a label', () => {
		expect(addedByName(DANIEL, labels, undefined)).toBe(
			formatAddress(DANIEL),
		);
	});

	test('marks the signed-in address', () => {
		expect(addedByName(MAYA, labels, MAYA)).toBe(
			'Maya (you)',
		);
	});
});
