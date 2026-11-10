// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
	return source.getPages().map((page) => ({
		url: new URL(page.url, siteUrl).toString(),
	}));
}
