// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Keep first: sets the stack's defaults before `support/env` reads them.
import './docs-screenshots/env';

import { defineConfig } from '@playwright/test';

import { E2E } from './support/env';

// Regenerates the docs' screenshots on a stack of its own: a fresh chain, an
// empty database, and servers it never shares.
export default defineConfig({
	testDir: './docs-screenshots',
	workers: 1,
	retries: 0,
	timeout: 180_000,
	expect: { timeout: 30_000 },
	reporter: 'list',
	globalSetup: './global-setup.ts',
	// Wide enough that full addresses and digests fit on one line.
	use: {
		baseURL: E2E.appUrl,
		viewport: { width: 1500, height: 800 },
		deviceScaleFactor: 2,
		colorScheme: 'light',
		reducedMotion: 'reduce',
		browserName: 'chromium',
		channel: E2E.browserChannel,
	},
	webServer: [
		{
			name: 'sui',
			command: `./start-localnet.sh ${new URL(E2E.rpcUrl).port} ${new URL(E2E.faucetUrl).port}`,
			url: `${E2E.faucetUrl}/`,
			env: { RUST_LOG: 'off' },
			stdout: 'ignore',
			timeout: 120_000,
			reuseExistingServer: false,
			gracefulShutdown: {
				signal: 'SIGINT',
				timeout: 10_000,
			},
		},
		{
			name: 'api',
			cwd: '../api',
			command:
				'bun run --cwd ../sdk build && bun run db:prepare --fresh && bun run src/index.ts',
			url: `${E2E.apiUrl}/health`,
			// Mainnet in the app, served by the local chain.
			env: {
				DATABASE_URL: E2E.databaseUrl,
				// The API's timestamps assume a UTC session.
				PGOPTIONS: '-c TimeZone=UTC',
				JWT_SECRET:
					'docs-jwt-secret-that-is-only-used-for-screenshots',
				SUPPORTED_NETWORKS: 'mainnet',
				CORS_ALLOWED_ORIGINS: E2E.appUrl,
				PORT: String(E2E.apiPort),
				SUI_RPC_URL_mainnet: E2E.rpcUrl,
			},
			timeout: 60_000,
			reuseExistingServer: false,
		},
		{
			name: 'app',
			cwd: '../app',
			// The dev server: the preview's CSP would block the wallet's
			// direct calls to the local chain.
			command: `bunx vite --port ${E2E.appPort} --strictPort`,
			url: E2E.appUrl,
			env: { VITE_API_URL: E2E.apiUrl },
			timeout: 180_000,
			reuseExistingServer: false,
		},
	],
});
