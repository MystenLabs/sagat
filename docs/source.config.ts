// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	defineConfig,
	defineDocs,
} from 'fumadocs-mdx/config';

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
		// Keep image src a plain path so Screenshot can find its -dark twin.
		remarkImageOptions: { useImport: false },
	},
});
