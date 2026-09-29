// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';

const e2eRoot = fileURLToPath(
	new URL('..', import.meta.url),
);

export const PATHS = {
	walletEntry: `${e2eRoot}wallet/inject.ts`,
	// Built by global-setup.ts; gitignored.
	walletBundle: `${e2eRoot}.cache/e2e-wallet.js`,
};
