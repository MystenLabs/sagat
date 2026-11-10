// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export function apiOrigin(value: string): string {
	const url = new URL(value);
	const local =
		url.protocol === 'http:' &&
		(url.hostname === 'localhost' ||
			url.hostname === '127.0.0.1');
	if (url.protocol !== 'https:' && !local)
		throw new Error(
			`VITE_API_URL must be https://<host>, http://localhost or http://127.0.0.1, got '${value}'`,
		);
	return url.origin;
}

if (import.meta.main)
	console.log(apiOrigin(process.env.VITE_API_URL ?? ''));
