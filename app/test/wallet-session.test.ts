// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import {
	declinedMessage,
	WalletDeclinedError,
} from '../src/lib/wallet-session';

describe('wallet session', () => {
	test('the declined message names the wallet', () => {
		expect(declinedMessage('Slush')).toBe(
			'You declined the request in Slush. You’re not signed in.',
		);
	});

	test('a declined error carries the wallet name', () => {
		const error = new WalletDeclinedError('Slush');
		expect(error).toBeInstanceOf(Error);
		expect(error.wallet).toBe('Slush');
	});
});
