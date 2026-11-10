// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	MarkdownCopyButton,
	ViewOptionsPopover,
} from 'fumadocs-ui/layouts/notebook/page';
import defaultMdxComponents, {
	createRelativeLink,
} from 'fumadocs-ui/mdx';
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from 'fumadocs-ui/page';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
	Screenshot,
	type ScreenshotProps,
} from '@/components/screenshot';
import { github } from '@/lib/site';
import { source } from '@/lib/source';

type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page(props: Props) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	const MDX = page.data.body;
	const markdownUrl = `/md/${page.slugs.join('/') || 'index'}.md`;
	const githubUrl = `https://github.com/${github.owner}/${github.repo}/blob/${github.branch}/docs/content/${page.path}`;

	return (
		<DocsPage
			toc={page.data.toc}
			full={page.data.full}
			editOnGithub={{
				owner: github.owner,
				repo: github.repo,
				sha: github.branch,
				path: `docs/content/${page.path}`,
			}}
		>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription>
				{page.data.description}
			</DocsDescription>
			<div className="-mt-4 mb-4 flex flex-row flex-wrap items-center gap-2">
				<MarkdownCopyButton markdownUrl={markdownUrl} />
				<ViewOptionsPopover
					markdownUrl={markdownUrl}
					githubUrl={githubUrl}
				/>
			</div>
			<DocsBody>
				<MDX
					components={{
						...defaultMdxComponents,
						a: createRelativeLink(source, page),
						img: (props) => (
							<Screenshot
								{...(props as ScreenshotProps)}
								className="rounded-lg"
							/>
						),
					}}
				/>
			</DocsBody>
		</DocsPage>
	);
}

export function generateStaticParams() {
	return source.generateParams();
}

export async function generateMetadata(
	props: Props,
): Promise<Metadata> {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	return {
		title: page.data.title,
		description: page.data.description,
	};
}
