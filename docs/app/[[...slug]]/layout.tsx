// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import type { ReactNode } from 'react';

import { PodsWordmark } from '@/components/logo';
import { github, siteName } from '@/lib/site';
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
			}}
			githubUrl={`https://github.com/${github.owner}/${github.repo}`}
		>
			{children}
		</DocsLayout>
	);
}
