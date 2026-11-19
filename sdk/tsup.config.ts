// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/v1/index.ts'],
	format: ['cjs', 'esm'],
	// Shared chunks keep one SagatApiError class across both entries in CJS too.
	splitting: true,
	outDir: 'dist',
	dts: true,
	sourcemap: true,
	clean: true,
});
