// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Users } from 'lucide-react';
import { matchPath } from 'react-router-dom';

import {
	AssetsIcon,
	OverviewIcon,
	ProposalsIcon,
} from '../components/ui/nav-icons';
import { content } from '../content';

const COPY = content.overview.pages;

/**
 * An account's pages, in sidebar order. The label names the sidebar item
 * and the page's title.
 */
export const MULTISIG_PAGES = [
	{
		id: 'overview',
		label: COPY.overview,
		icon: OverviewIcon,
	},
	{
		id: 'proposals',
		label: COPY.proposals,
		icon: ProposalsIcon,
	},
	{
		id: 'assets',
		label: COPY.assets,
		icon: AssetsIcon,
	},
	// "Members" covers the signers and the external proposers; the id
	// and the path stay `signers`.
	{
		id: 'signers',
		label: COPY.signers,
		icon: Users,
	},
] as const;

export type MultisigPageId =
	(typeof MULTISIG_PAGES)[number]['id'];

/**
 * The pod the sidebar presents: the route's, else the last viewed, else
 * the first. None on the shared proposal page or on a pod route outside
 * `accepted`.
 */
export function sidebarPod<T extends { address: string }>(
	pathname: string,
	accepted: T[],
	lastViewed: string | null,
): T | undefined {
	if (matchPath('/proposals', pathname)) return undefined;
	const routeAddress = matchPath(
		{ path: '/multisig/:address', end: false },
		pathname,
	)?.params.address;
	if (routeAddress)
		return accepted.find((m) => m.address === routeAddress);
	return (
		accepted.find((m) => m.address === lastViewed) ??
		accepted[0]
	);
}

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
