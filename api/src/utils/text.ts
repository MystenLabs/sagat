// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ValidationError } from '../errors';

// Control characters (C0, DEL, C1) and format characters: bidi overrides,
// zero-width joiners and the like, which can reorder or hide text.
const FORBIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}]/u;
const FORBIDDEN_EXCEPT_LINE_BREAKS =
	/(?![\t\n\r])[\p{Cc}\p{Cf}]/u;

export type TextRules = {
	maxLength: number;
	// Allows tab, line feed and carriage return.
	allowLineBreaks?: boolean;
	errors: {
		notAString: string;
		forbiddenCharacters: string;
		tooLong: string;
	};
};

/**
 * Normalizes an optional user-written string. Missing, null and blank all
 * mean none. Text is NFC-normalized, trimmed, limited to `maxLength`
 * characters (code points), and may not contain control or format
 * characters.
 */
export const normalizeText = (
	value: unknown,
	{ maxLength, allowLineBreaks = false, errors }: TextRules,
): string | null => {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string')
		throw new ValidationError(errors.notAString);
	const forbidden = allowLineBreaks
		? FORBIDDEN_EXCEPT_LINE_BREAKS
		: FORBIDDEN_CHARACTERS;
	if (forbidden.test(value))
		throw new ValidationError(errors.forbiddenCharacters);
	const trimmed = value.normalize('NFC').trim();
	if (trimmed.length === 0) return null;
	if ([...trimmed].length > maxLength)
		throw new ValidationError(errors.tooLong);
	return trimmed;
};
