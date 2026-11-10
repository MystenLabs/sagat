// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import './global.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Provider } from '@/components/provider';
import {
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
				<Provider>{children}</Provider>
			</body>
		</html>
	);
}
