// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ValidationError } from '../errors';

export const MAX_KEY_LABEL_LENGTH = 64;

// Control characters (C0, DEL, C1) and format characters: bidi overrides,
// zero-width joiners and the like. A label is shown next to a key, so
// nothing that can reorder or hide text is allowed in it.
const FORBIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}]/u;

/**
 * Normalizes the optional `labels` of a create request: one entry per public
 * key, in the same order. Missing arrays, null entries and blank strings all
 * mean "no label". Labels are NFC-normalized, trimmed, limited to
 * `MAX_KEY_LABEL_LENGTH` characters (code points), and may not contain
 * control or format characters.
 */
export const normalizeKeyLabels = (
	labels: unknown,
	publicKeyCount: number,
): (string | null)[] => {
	if (labels === undefined || labels === null)
		return Array.from(
			{ length: publicKeyCount },
			() => null,
		);

	if (
		!Array.isArray(labels) ||
		labels.length !== publicKeyCount
	)
		throw new ValidationError(
			'labels must be an array with one entry per public key.',
		);

	return labels.map((label) => {
		if (label === null || label === undefined) return null;
		if (typeof label !== 'string')
			throw new ValidationError(
				'Each label must be a string or null.',
			);
		if (FORBIDDEN_CHARACTERS.test(label))
			throw new ValidationError(
				'Labels may not contain control or formatting characters.',
			);
		const trimmed = label.normalize('NFC').trim();
		if (trimmed.length === 0) return null;
		if ([...trimmed].length > MAX_KEY_LABEL_LENGTH)
			throw new ValidationError(
				`Labels must be at most ${MAX_KEY_LABEL_LENGTH} characters.`,
			);
		return trimmed;
	});
};
