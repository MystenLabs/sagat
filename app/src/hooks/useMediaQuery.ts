// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';

/** Tracks a CSS media query. Starts from its current value on the client. */
export function useMediaQuery(query: string) {
	const [matches, setMatches] = useState(() =>
		typeof window === 'undefined'
			? false
			: window.matchMedia(query).matches,
	);

	useEffect(() => {
		const mql = window.matchMedia(query);
		const onChange = () => setMatches(mql.matches);
		onChange();
		mql.addEventListener('change', onChange);
		return () =>
			mql.removeEventListener('change', onChange);
	}, [query]);

	return matches;
}
