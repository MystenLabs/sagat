// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Ports and URLs for the stack the suite runs against. The defaults stay clear
// of `bun dev` (API 3000, app 5173) so both can run side by side.
const apiPort = Number(process.env.E2E_API_PORT ?? 3100);
const appPort = Number(process.env.E2E_APP_PORT ?? 4173);

export const E2E = {
	// The API only auto-allows `http://localhost:*` origins, so the app must be
	// served from `localhost` (not `127.0.0.1`).
	appUrl: `http://localhost:${appPort}`,
	appPort,
	apiUrl: `http://localhost:${apiPort}`,
	apiPort,
	rpcUrl:
		process.env.E2E_SUI_RPC_URL ?? 'http://127.0.0.1:9000',
	faucetUrl:
		process.env.E2E_SUI_FAUCET_URL ??
		'http://127.0.0.1:9123',
	databaseUrl:
		process.env.E2E_DATABASE_URL ??
		'postgresql://localhost:5432/sagat_e2e',
	// `dev` (vite dev server) is quicker to iterate on; `preview` serves the
	// production build, which is what CI tests.
	appServer: (process.env.E2E_APP_SERVER ??
		(process.env.CI ? 'preview' : 'dev')) as
		| 'dev'
		| 'preview',
	walletName: 'E2E Wallet',
};
