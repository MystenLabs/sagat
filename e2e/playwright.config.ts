// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { defineConfig, devices } from '@playwright/test';

import { E2E } from './support/env';

const isCI = !!process.env.CI;

// Start the local network on the ports the configured URLs point at.
const suiCommand = [
	'sui start --force-regenesis',
	`--fullnode-rpc-port ${new URL(E2E.rpcUrl).port || 9000}`,
	`--with-faucet=${new URL(E2E.faucetUrl).port || 9123}`,
	// Long epochs so an epoch change never lands mid-test.
	'--epoch-duration-ms 3600000',
].join(' ');

const appCommand =
	E2E.appServer === 'preview'
		? `bunx vite build && bunx vite preview --port ${E2E.appPort} --strictPort`
		: `bunx vite --port ${E2E.appPort} --strictPort`;

export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: isCI,
	retries: isCI ? 1 : 0,
	workers: isCI ? 2 : undefined,
	timeout: 60_000,
	expect: { timeout: 15_000 },
	reporter: isCI
		? [['github'], ['list'], ['html', { open: 'never' }]]
		: [['list'], ['html', { open: 'never' }]],
	globalSetup: './global-setup.ts',
	// Tracing and screenshots also cover the per-user contexts the tests open
	// (video would only cover the built-in `page` fixture, which we don't use).
	use: {
		baseURL: E2E.appUrl,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	// Started in order, before global setup. Locally, anything already
	// listening on these URLs is reused (e.g. a running `sui start`).
	webServer: [
		{
			name: 'sui',
			command: suiCommand,
			url: `${E2E.faucetUrl}/`,
			env: { RUST_LOG: 'off' },
			stdout: 'ignore',
			timeout: 120_000,
			reuseExistingServer: !isCI,
			gracefulShutdown: {
				signal: 'SIGINT',
				timeout: 10_000,
			},
		},
		{
			name: 'api',
			cwd: '../api',
			command:
				'bun run --cwd ../sdk build && bun run db:prepare && bun run src/index.ts',
			url: `${E2E.apiUrl}/health`,
			env: {
				DATABASE_URL: E2E.databaseUrl,
				JWT_SECRET:
					'e2e-jwt-secret-that-is-only-used-by-tests',
				SUPPORTED_NETWORKS: 'localnet',
				CORS_ALLOWED_ORIGINS: E2E.appUrl,
				PORT: String(E2E.apiPort),
				SUI_RPC_URL_localnet: E2E.rpcUrl,
			},
			timeout: 60_000,
			reuseExistingServer: !isCI,
		},
		{
			name: 'app',
			cwd: '../app',
			command: appCommand,
			url: E2E.appUrl,
			env: {
				VITE_API_URL: E2E.apiUrl,
				VITE_LOCALNET_RPC_URL: E2E.rpcUrl,
			},
			timeout: 180_000,
			reuseExistingServer: !isCI,
		},
	],
});
