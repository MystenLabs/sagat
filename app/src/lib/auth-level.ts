// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { matchPath } from 'react-router-dom';

export type AuthLevel = 'public' | 'wallet' | 'full';

// The routes that need less than a full sign-in. Every other path,
// unknown ones included, needs the wallet and an API session.
const RELAXED_ROUTES: {
	path: string;
	authLevel: AuthLevel;
}[] = [
	// The tools index and every tool page.
	{ path: '/tools/*', authLevel: 'public' },
	// Shared proposal links: a wallet, but no API session.
	{ path: '/proposals', authLevel: 'wallet' },
];

export function getAuthLevel(pathname: string): AuthLevel {
	for (const route of RELAXED_ROUTES) {
		if (matchPath(route.path, pathname)) {
			return route.authLevel;
		}
	}
	return 'full';
}
