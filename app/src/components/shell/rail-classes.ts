// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Pointer, hover and focus for the shell's own menu triggers (account
 * switcher, network row, theme row, wallet row), which are plain elements
 * rather than `SidebarMenuButton`s.
 */
export const railTriggerClass =
	'cursor-pointer outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring';

/** On the icon rail, a full-width row shrinks to a centred 32px square. */
export const railSquareClass =
	'group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0';
