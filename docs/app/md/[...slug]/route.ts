// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { alphaNoticeMarkdown } from '@/lib/site';
import { source } from '@/lib/source';

export const dynamic = 'force-static';
export const dynamicParams = false;

// The last segment carries the `.md`; `index.md` is the landing page.
function pageSlug(slug: string[]): string[] {
	const path = slug.join('/').replace(/\.md$/, '');
	return path === 'index' ? [] : path.split('/');
}

export async function GET(
	_request: Request,
	props: { params: Promise<{ slug: string[] }> },
) {
	const { slug } = await props.params;
	const page = source.getPage(pageSlug(slug));
	if (!page)
		return new Response('Not found', { status: 404 });

	const body = await page.data.getText('processed');
	const description = page.data.description
		? `${page.data.description}\n\n`
		: '';
	return new Response(
		`# ${page.data.title}\n\n> ${alphaNoticeMarkdown}\n\n${description}${body}`,
		{
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
			},
		},
	);
}

export function generateStaticParams() {
	return source.getPages().map((page) => {
		const slug = page.slugs.length ? page.slugs : ['index'];
		return {
			slug: [...slug.slice(0, -1), `${slug.at(-1)}.md`],
		};
	});
}
