// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';

// The screenshot stack's own ports and chain; the environment wins.
const DEFAULTS = {
	E2E_SUI_RPC_URL: 'http://127.0.0.1:9300',
	E2E_SUI_FAUCET_URL: 'http://127.0.0.1:9323',
	E2E_API_PORT: '3199',
	E2E_APP_PORT: '4199',
	// A day, so proposals show a realistic expiry.
	LOCALNET_EPOCH_MS: String(24 * 60 * 60 * 1000),
};

for (const [key, value] of Object.entries(DEFAULTS))
	process.env[key] ??= value;

// Dropped and wiped every run, so only screenshot-only variables set them.
process.env.E2E_DATABASE_URL =
	process.env.DOCS_SCREENSHOTS_DATABASE_URL ??
	'postgresql://localhost:5432/sagat_docs_screenshots';
process.env.LOCALNET_DIR =
	process.env.DOCS_SCREENSHOTS_LOCALNET_DIR ??
	fileURLToPath(
		new URL('../.cache/localnet-docs', import.meta.url),
	);
