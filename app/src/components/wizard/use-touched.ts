// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from 'react';

/**
 * Which of a form's fields have been used, so their errors wait until
 * then. The rule every wizard form follows: a field is touched on blur,
 * on a change once it already had a value (so the first keystroke into
 * an empty field doesn't flag it), or when it starts out filled (back
 * from a later step). `initial` holds that last case; callers call
 * `touch` for the other two.
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
	return { touched, touch };
}
