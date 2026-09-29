// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { build } from 'esbuild';

import { PATHS } from './support/paths';

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
}
