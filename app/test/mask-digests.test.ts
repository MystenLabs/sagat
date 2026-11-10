// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	isValidTransactionDigest,
	normalizeSuiAddress,
	toBase58,
} from '@mysten/sui/utils';
import { describe, expect, test } from 'vitest';

import {
	maskDigests,
	maskDigestsInText,
} from '../src/lib/mask-digests';

const digest = toBase58(new Uint8Array(32).fill(7));
const address = normalizeSuiAddress('0x7');

describe('maskDigests', () => {
	test('replaces every digest in a report and keeps the rest', () => {
		expect(isValidTransactionDigest(digest)).toBe(true);
		const report = {
			request: {
				url: `https://app.example/multisig/${address}/proposals/${digest}`,
			},
			breadcrumbs: [
				{
					data: {
						url: `https://api.example/proposals/digest/${digest}`,
					},
				},
				{
					data: {
						url: `https://app.example/proposals?digest=${digest}`,
					},
				},
				{
					data: {
						url: `https://app.example/open?next=%2Fproposals%2F${digest}`,
					},
				},
			],
			exception: {
				values: [
					{ value: `Failed to load proposal ${digest}.` },
				],
			},
		};

		expect(maskDigests(report)).toEqual({
			request: {
				url: `https://app.example/multisig/${address}/proposals/:digest`,
			},
			breadcrumbs: [
				{
					data: {
						url: 'https://api.example/proposals/digest/:digest',
					},
				},
				{
					data: {
						url: 'https://app.example/proposals?digest=:digest',
					},
				},
				{
					data: {
						url: 'https://app.example/open?next=%2Fproposals%2F:digest',
					},
				},
			],
			exception: {
				values: [
					{ value: 'Failed to load proposal :digest.' },
				],
			},
		});
	});

	test('leaves addresses and hashed asset names alone', () => {
		expect(maskDigestsInText(address)).toBe(address);
		expect(maskDigestsInText('index-DOWb2Nsg.js')).toBe(
			'index-DOWb2Nsg.js',
		);
	});
});
