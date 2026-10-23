// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import { currentMultisigPage } from '../src/lib/multisig-pages';

const ACCOUNT = `0x${'ab'.repeat(32)}`;

describe('current multisig page', () => {
	test('reads the page from the path', () => {
		expect(
			currentMultisigPage(`/multisig/${ACCOUNT}/signers`),
		).toBe('signers');
		expect(
			currentMultisigPage(`/multisig/${ACCOUNT}/overview/`),
		).toBe('overview');
	});

	test('falls back to the proposals page', () => {
		expect(
			currentMultisigPage(`/multisig/${ACCOUNT}`),
		).toBe('proposals');
		expect(
			currentMultisigPage(`/multisig/${ACCOUNT}/unknown`),
		).toBe('proposals');
		expect(currentMultisigPage('/invitations')).toBe(
			'proposals',
		);
	});
});
