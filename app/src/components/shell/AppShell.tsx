// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { CustomWalletButton } from '@/components/CustomWalletButton';
import { Logo } from '@/components/Logo';
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from '@/components/ui/sidebar';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

import { AppSidebar } from './AppSidebar';
import { ThemeToggle } from './ThemeToggle';

/** Sidebar width from the designs; the icon rail when collapsed. */
const SIDEBAR_WIDTH = '232px';
const SIDEBAR_WIDTH_ICON = '48px';

/**
 * App chrome: the sidebar on the left and the page on the right. The sidebar
 * is expanded on wide screens, collapses to an icon rail below 1280px and
 * becomes a sheet under 768px. Cmd/Ctrl+B toggles it anywhere.
 */
export function AppShell({
	children,
	contentClassName,
}: {
	children: ReactNode;
	contentClassName?: string;
}) {
	const wide = useMediaQuery('(min-width: 1280px)');
	const [open, setOpen] = useState(wide);
	// Follow the viewport when it crosses the breakpoint; the user can still
	// toggle manually in between.
	const [prevWide, setPrevWide] = useState(wide);
	if (wide !== prevWide) {
		setPrevWide(wide);
		setOpen(wide);
	}

	return (
		<SidebarProvider
			open={open}
			onOpenChange={setOpen}
			style={
				{
					'--sidebar-width': SIDEBAR_WIDTH,
					'--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
				} as React.CSSProperties
			}
		>
			<AppSidebar />
			<SidebarInset
				className={cn('min-w-0', contentClassName)}
			>
				<header className="flex h-12 items-center gap-2 border-b bg-card px-3 md:hidden">
					<SidebarTrigger className="-ml-1" />
					<Link to="/" className="flex items-center">
						<Logo
							size="sm"
							showSubtitle={false}
							asLink={false}
						/>
					</Link>
					<div className="ml-auto flex items-center gap-1">
						<ThemeToggle className="text-muted-foreground hover:bg-accent hover:text-foreground data-open:bg-accent" />
						<CustomWalletButton />
					</div>
				</header>
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}
