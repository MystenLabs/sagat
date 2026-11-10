// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from 'react';

/**
 * Which of a form's text fields have been used, so their errors wait
 * until then (signer rows show theirs at once). A field is touched on
 * blur (`touch`), on a change once it already had a value (`change`, so
 * the first keystroke into an empty field doesn't flag it), or when it
 * starts out filled, as back from a later step (`initial`).
 */
export function useTouched<Field extends string>(
	initial: Record<Field, boolean>,
) {
	const [touched, setTouched] = useState(initial);
	const touch = useCallback(
		(field: Field) =>
			setTouched((t) =>
				t[field] ? t : { ...t, [field]: true },
			),
		[],
	);
	/** Call on a change, with the field's value before it. */
	const change = useCallback(
		(field: Field, previous: string) => {
			if (previous !== '') touch(field);
		},
		[touch],
	);
	return { touched, touch, change };
}
