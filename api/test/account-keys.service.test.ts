// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/** Pure checks on key labels. No database or localnet needed. */
import { describe, expect, test } from 'bun:test';

import {
	MAX_KEY_LABEL_LENGTH,
	normalizeKeyLabels,
} from '../src/services/account-keys.service';

describe('normalizeKeyLabels', () => {
	test('a missing array means no labels', () => {
		expect(normalizeKeyLabels(undefined, 3)).toEqual([
			null,
			null,
			null,
		]);
		expect(normalizeKeyLabels(null, 2)).toEqual([
			null,
			null,
		]);
	});

	test('never sizes anything by an unbounded count', () => {
		for (const count of [
			4294967295,
			11,
			-1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
		])
			expect(() =>
				normalizeKeyLabels(undefined, count),
			).toThrow('at most 10 keys');
	});

	test('trims, normalizes and blanks', () => {
		expect(
			normalizeKeyLabels(
				['  Ops key ', '', '   ', null],
				4,
			),
		).toEqual(['Ops key', null, null, null]);
		// NFC: a decomposed e + acute becomes one code point.
		expect(normalizeKeyLabels(['José', null], 2)).toEqual([
			'José',
			null,
		]);
	});

	test('counts characters, not UTF-16 units', () => {
		const emoji = '\u{1F512}'.repeat(MAX_KEY_LABEL_LENGTH);
		expect(normalizeKeyLabels([emoji], 1)).toEqual([emoji]);
		expect(() =>
			normalizeKeyLabels([`${emoji}x`], 1),
		).toThrow(`at most ${MAX_KEY_LABEL_LENGTH} characters`);
	});

	test('rejects the wrong shape and bad characters', () => {
		expect(() => normalizeKeyLabels(['a'], 2)).toThrow(
			'one entry per public key',
		);
		expect(() => normalizeKeyLabels('a', 1)).toThrow(
			'one entry per public key',
		);
		expect(() => normalizeKeyLabels([1], 1)).toThrow(
			'string or null',
		);
		for (const bad of ['a‮b', 'a​b', 'a\nb', '\u0000'])
			expect(() => normalizeKeyLabels([bad], 1)).toThrow(
				'control or formatting characters',
			);
	});
});
