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
import { github, markdownCopyUrl } from '@/lib/site';
import { source } from '@/lib/source';

type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page(props: Props) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	const MDX = page.data.body;
	const markdownUrl = markdownCopyUrl(page.url);
	const contentPath = `docs/content/${page.path}`;
	const githubUrl = `https://github.com/${github.owner}/${github.repo}/blob/${github.branch}/${contentPath}`;
	const hasToc = page.data.toc.length > 0;
	const pageActions = (
		<div
			data-page-actions=""
			className={
				hasToc
					? 'mt-4 mb-4 flex flex-row flex-wrap items-center gap-2 border-t border-fd-border pt-4'
					: 'mb-4 flex flex-row flex-wrap items-center gap-2'
			}
		>
			<MarkdownCopyButton markdownUrl={markdownUrl} />
			<ViewOptionsPopover
				markdownUrl={markdownUrl}
				githubUrl={githubUrl}
			/>
		</div>
	);
	return (
		<DocsPage
			toc={page.data.toc}
			full={page.data.full}
			tableOfContent={{
				footer: pageActions,
				// Without headings, show only the actions: no title, no "No Headings".
				container: hasToc
					? undefined
					: {
							className:
								'[&>:not([data-page-actions])]:hidden',
						},
			}}
			tableOfContentPopover={{
				footer: pageActions,
				content: hasToc
					? undefined
					: {
							className:
								'[&>div]:pt-4 [&>div>:not([data-page-actions])]:hidden',
						},
			}}
			editOnGithub={{
				owner: github.owner,
				repo: github.repo,
				sha: github.branch,
				path: contentPath,
			}}
		>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription>
				{page.data.description}
			</DocsDescription>
			<DocsBody className="pb-6">
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
