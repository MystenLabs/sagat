// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	defineConfig,
	defineDocs,
} from 'fumadocs-mdx/config';

import { remarkDarkImage } from './lib/remark-dark-image';

export const docs = defineDocs({
	dir: 'content',
	docs: {
		postprocess: {
			includeProcessedMarkdown: true,
		},
	},
});

export default defineConfig({
	mdxOptions: {
		remarkPlugins: [remarkDarkImage],
	},
});
