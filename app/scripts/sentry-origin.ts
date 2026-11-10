// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { makeDsn } from '@sentry/core';

export function sentryOrigin(value: string): string {
	if (!value) return '';
	// The SDK's own parser, so a DSN it would refuse fails the build.
	const dsn = makeDsn(value);
	if (!dsn || dsn.protocol !== 'https')
		throw new Error(
			`VITE_SENTRY_DSN must be https://<key>@<host>/<project>, got '${value}'`,
		);
	return new URL(value).origin;
}

if (import.meta.main)
	console.log(
		sentryOrigin(process.env.VITE_SENTRY_DSN ?? ''),
	);
