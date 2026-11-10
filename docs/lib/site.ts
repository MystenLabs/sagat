// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export const siteName = 'Sui Pods';
export const siteDescription =
	'Guides and reference for managing Sui multisig accounts.';
export const alphaNotice = `${siteName} is in alpha. Expect breaking changes to the API and SDK for now; we recommend using only the web app.`;

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
