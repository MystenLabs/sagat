// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	Coins,
	FileText,
	LayoutDashboard,
	Users,
} from 'lucide-react';

/**
 * An account's pages, in sidebar order. The label names the sidebar item
 * and the page's title.
 */
export const MULTISIG_PAGES = [
	{
		id: 'overview',
		label: 'Overview',
		icon: LayoutDashboard,
	},
	{ id: 'proposals', label: 'Proposals', icon: FileText },
	{ id: 'assets', label: 'Assets', icon: Coins },
	{ id: 'signers', label: 'Signers', icon: Users },
] as const;
