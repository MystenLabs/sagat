// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	Coins,
	FileText,
	LayoutDashboard,
	Users,
} from 'lucide-react';
import { matchPath } from 'react-router-dom';

import { content } from '../content';

/**
 * An account's pages, in sidebar order. The label names the sidebar item
 * and the page's title.
 */
export const MULTISIG_PAGES = [
	{
		id: 'overview',
		label: content.overview.pages.overview,
		icon: LayoutDashboard,
	},
	{
		id: 'proposals',
		label: content.overview.pages.proposals,
		icon: FileText,
	},
	{
		id: 'assets',
		label: content.overview.pages.assets,
		icon: Coins,
	},
	// "Members" covers the signers and the external proposers; the id
	// and the path stay `signers`.
	{
		id: 'signers',
		label: content.overview.pages.signers,
		icon: Users,
	},
] as const;

export type MultisigPageId =
	(typeof MULTISIG_PAGES)[number]['id'];

/**
 * The account page a path is on, for the title and the sidebar. The
 * account's bare path redirects to its overview.
 */
export function currentMultisigPage(
	pathname: string,
): MultisigPageId {
	const page = matchPath(
		{ path: '/multisig/:address/:page', end: false },
		pathname,
	)?.params.page;
	return (
		MULTISIG_PAGES.find((p) => p.id === page)?.id ??
		'overview'
	);
}
