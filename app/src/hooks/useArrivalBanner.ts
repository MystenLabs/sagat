// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Router state a flow leaves when it lands on an account. */
export type ArrivalState = {
	/** Just accepted the invitation. */
	joined?: boolean;
	/** Just created it; who got an invitation. */
	created?: { invited: string[] };
};

export type Arrival =
	| { kind: 'joined' }
	| { kind: 'created'; invited: string[] };

/**
 * The greeting for an account page reached from the invitation or create
 * flow. Router state lives in history, so it is copied here and cleared at
 * once: the banner shows one time, not again on reload or Back. It belongs
 * to the page it landed on and goes once you move to another tab.
 */
export function useArrivalBanner(): [
	Arrival | null,
	() => void,
] {
	const location = useLocation();
	const navigate = useNavigate();
	const state = location.state as ArrivalState | null;
	const incoming: Arrival | null = state?.created
		? { kind: 'created', invited: state.created.invited }
		: state?.joined
			? { kind: 'joined' }
			: null;

	const [shown, setShown] = useState<{
		path: string;
		arrival: Arrival;
	} | null>(() =>
		incoming
			? { path: location.pathname, arrival: incoming }
			: null,
	);
	// Adjusted during render (not in an effect) so the banner never
	// flashes on the wrong page.
	if (incoming && shown?.path !== location.pathname) {
		setShown({
			path: location.pathname,
			arrival: incoming,
		});
	} else if (
		!incoming &&
		shown &&
		shown.path !== location.pathname
	) {
		setShown(null);
	}

	const hasIncoming = !!incoming;
	useEffect(() => {
		if (!hasIncoming) return;
		navigate(location.pathname + location.search, {
			replace: true,
			state: null,
		});
	}, [
		hasIncoming,
		location.pathname,
		location.search,
		navigate,
	]);

	return [
		shown?.path === location.pathname
			? shown.arrival
			: null,
		() => setShown(null),
	];
}
