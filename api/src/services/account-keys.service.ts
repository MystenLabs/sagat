// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { LIMITS } from '../constants/limits';
import { MAX_KEY_LABEL_LENGTH } from '../db/schema';
import { ValidationError } from '../errors';
import { normalizeText } from '../utils/text';

export { MAX_KEY_LABEL_LENGTH };

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
	// Never size anything by an unchecked count, whatever the caller did.
	if (
		!Number.isSafeInteger(publicKeyCount) ||
		publicKeyCount < 0 ||
		publicKeyCount > LIMITS.maxMembersPerMultisig
	)
		throw new ValidationError(
			`A multisig has at most ${LIMITS.maxMembersPerMultisig} keys.`,
		);

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

	return labels.map((label) =>
		normalizeText(label, {
			maxLength: MAX_KEY_LABEL_LENGTH,
			errors: {
				notAString: 'Each label must be a string or null.',
				forbiddenCharacters:
					'Labels may not contain control or formatting characters.',
				tooLong: `Labels must be at most ${MAX_KEY_LABEL_LENGTH} characters.`,
			},
		}),
	);
};
