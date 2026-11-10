// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export const siteName = 'Sui Pods';
export const siteDescription =
	'Guides and reference for managing Sui multisig accounts.';
export const appUrl = 'https://app.suipods.io';

// The banner links appLabel to the app; text copies use the Markdown form.
export const alphaNotice = {
	lead: `${siteName} is in alpha. Expect breaking changes to the API and SDK for now; we recommend using only the `,
	appLabel: 'web app',
};
export const alphaNoticeMarkdown = `${alphaNotice.lead}[${alphaNotice.appLabel}](${appUrl}).`;

// Served by app/md/[...slug]/route.ts; `/` maps to `/md/index.md`.
export function markdownCopyUrl(pageUrl: string): string {
	return `/md${pageUrl === '/' ? '/index' : pageUrl}.md`;
}

export const github = {
	owner: 'MystenLabs',
	repo: 'sagat',
	branch: 'main',
};

const productionHost =
	process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const siteUrl = productionHost
	? `https://${productionHost}`
	: 'http://localhost:4000';
