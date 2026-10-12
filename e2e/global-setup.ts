// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { build } from 'esbuild';

import { Chain } from './support/chain';
import { E2E } from './support/env';
import { PATHS } from './support/paths';
import { publishTestCoin } from './support/test-coin';

// Runs once, after the web servers are up and before any test.
export default async function globalSetup() {
	const chain = new Chain();

	// Locally a running network is reused. If its fullnode prunes aggressively
	// (the `sui start` default), transactions stop being readable seconds after
	// they land and executions fail verification at random.
	const { ledgerService } = chain.client;
	const { response: info } =
		await ledgerService.getServiceInfo({});
	const lowest = info.lowestAvailableCheckpoint ?? 0n;
	if (lowest > 0n) {
		const { response } = await ledgerService.getCheckpoint({
			checkpointId: {
				oneofKind: 'sequenceNumber',
				sequenceNumber: lowest,
			},
			readMask: { paths: ['summary.timestamp'] },
		});
		const seconds = Number(
			response.checkpoint?.summary?.timestamp?.seconds ??
				0n,
		);
		if (Date.now() / 1000 - seconds < 10 * 60)
			throw new Error(
				`The Sui network at ${E2E.rpcUrl} prunes its history within minutes. Stop it and let the tests start one (see e2e/start-localnet.sh).`,
			);
	}

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
	const coin = await publishTestCoin(chain);
	process.env.E2E_TEST_COIN_TYPE = coin.type;
	process.env.E2E_TEST_COIN_FAUCET = coin.faucetId;
}
