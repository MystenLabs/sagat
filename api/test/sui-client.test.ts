// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'bun:test';

import { getSuiClient } from '../src/utils/client';

describe('getSuiClient', () => {
	test('shares one client per network', () => {
		expect(getSuiClient('localnet')).toBe(
			getSuiClient('localnet'),
		);
		expect(getSuiClient('testnet')).not.toBe(
			getSuiClient('localnet'),
		);
	});
});
