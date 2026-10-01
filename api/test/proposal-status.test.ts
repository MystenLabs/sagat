// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'bun:test';

import { hasMoved } from '../src/services/proposal-status.service';

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
