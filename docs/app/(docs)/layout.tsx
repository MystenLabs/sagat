// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import type { ReactNode } from 'react';

import { PodsWordmark } from '@/components/logo';
import {
	openAppLabel,
	OpenAppLink,
} from '@/components/open-app-link';
import { appUrl, github, siteName } from '@/lib/site';
import { source } from '@/lib/source';

export default function Layout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<DocsLayout
			tree={source.getPageTree()}
			nav={{
				title: (
					<span className="inline-flex items-center gap-2">
						<PodsWordmark className="h-5 w-auto" />
						<span className="sr-only">{siteName}</span>
						<span className="text-sm font-medium text-fd-muted-foreground">
							Docs
						</span>
					</span>
				),
				// Phone header only; from md the sidebar or the header carries the link.
				children: (
					<OpenAppLink className="ms-3 md:hidden" />
				),
			}}
			links={[
				{
					type: 'custom',
					on: 'nav',
					children: <OpenAppLink />,
				},
				{
					on: 'menu',
					text: openAppLabel,
					url: appUrl,
					external: true,
					active: 'none',
				},
			]}
			githubUrl={`https://github.com/${github.owner}/${github.repo}`}
		>
			{children}
		</DocsLayout>
	);
}
