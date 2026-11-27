// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';

import {
	currentMultisigPage,
	sidebarPod,
} from '../src/lib/multisig-pages';

const ACCOUNT = `0x${'ab'.repeat(32)}`;
const OTHER = `0x${'cd'.repeat(32)}`;

describe('sidebar pod', () => {
	test('presents no pod on the shared proposal page or a pod route outside the viewer’s pods', () => {
		const pod = { address: ACCOUNT };
		expect(
			sidebarPod('/proposals', [pod], ACCOUNT),
		).toBeUndefined();
		expect(
			sidebarPod(
				`/multisig/${OTHER}/overview`,
				[pod],
				ACCOUNT,
			),
		).toBeUndefined();
		expect(sidebarPod('/invitations', [pod], ACCOUNT)).toBe(
			pod,
		);
	});
});

describe('current multisig page', () => {
	test('reads the page from the path', () => {
		expect(
			currentMultisigPage(`/multisig/${ACCOUNT}/signers`),
		).toBe('signers');
		expect(
			currentMultisigPage(`/multisig/${ACCOUNT}/overview/`),
		).toBe('overview');
	});

	test('falls back to the overview page', () => {
		expect(
			currentMultisigPage(`/multisig/${ACCOUNT}`),
		).toBe('overview');
		expect(
			currentMultisigPage(`/multisig/${ACCOUNT}/unknown`),
		).toBe('overview');
		expect(currentMultisigPage('/invitations')).toBe(
			'overview',
		);
	});
});
