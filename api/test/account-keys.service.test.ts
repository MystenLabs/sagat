// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/** Pure checks on user-written text. No database or localnet needed. */
import { describe, expect, test } from 'bun:test';

import {
	MAX_KEY_LABEL_LENGTH,
	normalizeKeyLabels,
} from '../src/services/account-keys.service';
import { normalizeText } from '../src/utils/text';

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

describe('normalizeText', () => {
	const rules = {
		maxLength: 3,
		errors: {
			notAString: 'not a string',
			forbiddenCharacters: 'forbidden',
			tooLong: 'too long',
		},
	};

	test('keeps line breaks and tabs only when allowed', () => {
		expect(() => normalizeText('a\r\n\tb', rules)).toThrow(
			'forbidden',
		);
		expect(
			normalizeText(' a\r\n\tb ', {
				...rules,
				maxLength: 10,
				allowLineBreaks: true,
			}),
		).toBe('a\r\n\tb');
		// Other control and format characters stay refused.
		for (const bad of ['a\u202Eb', 'a\u0000b'])
			expect(() =>
				normalizeText(bad, {
					...rules,
					allowLineBreaks: true,
				}),
			).toThrow('forbidden');
	});

	test('accepts fully decomposed text at the cap', () => {
		const decomposed = 'ᾂ'.normalize('NFD').repeat(3);
		expect([...decomposed].length).toBe(12);
		expect(normalizeText(decomposed, rules)).toBe(
			'ᾂ'.repeat(3),
		);
	});
});
