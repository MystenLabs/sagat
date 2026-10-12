// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { build } from 'esbuild';

import { Chain } from './support/chain';
import { PATHS } from './support/paths';
import { publishTestCoin } from './support/test-coin';

// Runs once, after the web servers are up and before any test.
export default async function globalSetup() {
	// Bundle the test wallet into a script that can be injected into pages.
	await build({
		entryPoints: [PATHS.walletEntry],
		outfile: PATHS.walletBundle,
		bundle: true,
		format: 'iife',
		platform: 'browser',
		target: 'es2022',
		logLevel: 'warning',
	});

	// Workers inherit the environment, so this reaches every test.
	const coin = await publishTestCoin(new Chain());
	process.env.E2E_TEST_COIN_TYPE = coin.type;
	process.env.E2E_TEST_COIN_FAUCET = coin.faucetId;
}
