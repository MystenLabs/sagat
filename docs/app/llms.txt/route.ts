// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { llms } from 'fumadocs-core/source/llms';

import {
	siteDescription,
	siteName,
	siteUrl,
} from '@/lib/site';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

const index = llms(source, {
	renderUrl: (item) =>
		new URL(
			`/md${item.url === '/' ? '/index' : item.url}.md`,
			siteUrl,
		).toString(),
});

export async function GET() {
	const sections = source
		.getPageTree()
		.children.map((node) => index.indexNode(node));
	const text = [
		`# ${siteName}`,
		'',
		`> ${siteDescription}`,
		'',
		...sections,
	].join('\n');
	return new Response(text, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
		},
	});
}
