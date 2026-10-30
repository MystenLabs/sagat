// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { content } from '@/content';

/** What the sidebar toggle does next: one wording for its name and its tooltip. */
export function sidebarToggleLabel(expanded: boolean) {
	return expanded
		? content.sidebar.collapse
		: content.sidebar.expand;
}
