// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { init } from '@sentry/react';

import { maskDigests } from './mask-digests';

export function initSentry() {
	const dsn = import.meta.env.VITE_SENTRY_DSN;
	if (!dsn) return;
	init({
		dsn,
		environment: import.meta.env.MODE,
		release: import.meta.env.VITE_RELEASE || undefined,
		// No user fields and no IP inference.
		dataCollection: { userInfo: false },
		denyUrls: [
			/^chrome-extension:\/\//,
			/^moz-extension:\/\//,
			/^safari-web-extension:\/\//,
		],
		ignoreErrors: [/ResizeObserver loop/],
		// Breadcrumbs are already on the event here, so this masks them too.
		beforeSend: (event) => maskDigests(event),
	});
}
