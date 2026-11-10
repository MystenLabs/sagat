// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ImageZoom,
	type ImageZoomProps,
} from 'fumadocs-ui/components/image-zoom';
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

import { github } from '@/lib/site';
import { source } from '@/lib/source';

type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page(props: Props) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	const MDX = page.data.body;

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
			<DocsBody>
				<MDX
					components={{
						...defaultMdxComponents,
						a: createRelativeLink(source, page),
						img: (props) => (
							<ImageZoom
								{...(props as ImageZoomProps)}
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
