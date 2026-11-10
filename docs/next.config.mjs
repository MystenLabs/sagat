// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
	output: 'export',
	reactStrictMode: true,
	images: { unoptimized: true },
	turbopack: {
		root: fileURLToPath(new URL('..', import.meta.url)),
	},
};

export default withMDX(config);
