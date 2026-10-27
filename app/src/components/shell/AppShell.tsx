// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCallback,
	useEffect,
	useState,
	type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

import { getAuthLevel } from '@/components/AppRouter';
import { CustomWalletButton } from '@/components/CustomWalletButton';
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSessionBoot } from '@/hooks/useSessionBoot';
import { LocalStorageKeys } from '@/lib/localStorageKeys';

import { AppSidebar } from './AppSidebar';
import { ThemeToggle } from './ThemeToggle';

/** Sidebar width from the designs; the icon rail when collapsed. */
const SIDEBAR_WIDTH = '232px';
const SIDEBAR_WIDTH_ICON = '48px';

function readStoredOpen() {
	try {
		return (
			localStorage.getItem(LocalStorageKeys.SidebarOpen) !==
			'false'
		);
	} catch {
		return true;
	}
}

/**
 * App chrome: the sidebar on the left and the page on the right. On wide
 * screens the sidebar keeps the user's last choice (expanded by default),
 * collapses to an icon rail below 1280px and becomes a sheet under 768px. Cmd/Ctrl+B toggles it anywhere.
 */
export function AppShell({
	children,
}: {
	children: ReactNode;
}) {
	const wide = useMediaQuery('(min-width: 1280px)');
	// On wide screens the user's last choice wins; narrower viewports always
	// start on the icon rail.
	const [open, setOpenState] = useState(
		() => wide && readStoredOpen(),
	);
	const setOpen = useCallback(
		(next: boolean) => {
			setOpenState(next);
			// Only a wide-screen choice is saved, so toggling the rail on a
			// narrower window doesn't overwrite it.
			if (!wide) return;
			try {
				localStorage.setItem(
					LocalStorageKeys.SidebarOpen,
					String(next),
				);
			} catch {
				// Private mode or blocked storage: the choice just won't persist.
			}
		},
		[wide],
	);
	// Follow the viewport when it crosses the breakpoint; the user can still
	// toggle manually in between.
	const [prevWide, setPrevWide] = useState(wide);
	if (wide !== prevWide) {
		setPrevWide(wide);
		setOpenState(wide && readStoredOpen());
	}

	// Toasts centre on the content column, not the viewport: tell the
	// toaster (mounted outside the shell) how much the sidebar takes.
	const isMobile = useIsMobile();
	const { holdWalletControls } = useSessionBoot();
	// Picking a wallet signs in only where the page needs an API session.
	const { pathname } = useLocation();
	const signIn = getAuthLevel(pathname) === 'full';
	useEffect(() => {
		const left = isMobile
			? '0px'
			: open
				? SIDEBAR_WIDTH
				: SIDEBAR_WIDTH_ICON;
		document.documentElement.style.setProperty(
			'--content-left',
			left,
		);
		return () => {
			document.documentElement.style.removeProperty(
				'--content-left',
			);
		};
	}, [isMobile, open]);

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
			<SidebarInset className="min-w-0">
				<header className="flex h-12 items-center gap-2 border-b bg-card px-3 md:hidden">
					<SidebarTrigger className="-ml-1" />
					<div className="ml-auto flex items-center gap-1">
						<ThemeToggle className="text-muted-foreground hover:bg-accent hover:text-foreground data-open:bg-accent" />
						{holdWalletControls ? (
							<Skeleton className="h-7 w-36 rounded-md" />
						) : (
							<CustomWalletButton signIn={signIn} />
						)}
					</div>
				</header>
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}
