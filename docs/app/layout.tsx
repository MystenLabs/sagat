// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import './global.css';

import { Banner } from 'fumadocs-ui/components/banner';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Provider } from '@/components/provider';
import {
	alphaNotice,
	siteDescription,
	siteName,
	siteUrl,
} from '@/lib/site';

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: {
		template: `%s | ${siteName}`,
		default: siteName,
	},
	description: siteDescription,
};

export default function Layout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className="flex min-h-screen flex-col">
				{/* Sticky only from md up, where global.css sets its height. */}
				<Banner
					height="var(--fd-banner-height, auto)"
					changeLayout={false}
					className="bg-[color-mix(in_oklab,var(--color-fd-warning)_12%,var(--color-fd-background))] py-2 text-balance max-md:static"
				>
					{alphaNotice}
				</Banner>
				<Provider>{children}</Provider>
			</body>
		</html>
	);
}
