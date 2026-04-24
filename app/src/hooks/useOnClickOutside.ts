// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Run `handler` when a `mousedown` happens outside `ref`'s current
 * element. Pass `enabled={false}` to skip attaching the listener
 * entirely (e.g. while the popover/dropdown is closed).
 *
 * The handler is read through a ref so callers don't need to memoize
 * it — re-renders never re-attach the listener.
 */
export function useOnClickOutside<T extends HTMLElement>(
	ref: RefObject<T | null>,
	handler: (event: MouseEvent) => void,
	enabled: boolean = true,
) {
	const handlerRef = useRef(handler);
	useEffect(() => {
		handlerRef.current = handler;
	});

	useEffect(() => {
		if (!enabled) return;
		function onMouseDown(event: MouseEvent) {
			const node = ref.current;
			if (!node || node.contains(event.target as Node))
				return;
			handlerRef.current(event);
		}
		document.addEventListener('mousedown', onMouseDown);
		return () =>
			document.removeEventListener(
				'mousedown',
				onMouseDown,
			);
	}, [ref, enabled]);
}
