// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import {
	ArrowUpRight,
	BookOpen,
	ChevronRight,
	Coins,
	FileText,
	Github,
	LayoutDashboard,
	Mail,
} from 'lucide-react';
import { useMemo } from 'react';
import {
	Link,
	matchPath,
	useLocation,
} from 'react-router-dom';

import { CustomWalletButton } from '@/components/CustomWalletButton';
import { Logo } from '@/components/Logo';
import {
	NetworkMenuItems,
	NetworkStatusDot,
} from '@/components/NetworkMenu';
import {
	MultisigSwitcher,
	SwitcherSkeleton,
} from '@/components/shell/MultisigSwitcher';
import {
	railSquareClass,
	railTriggerClass,
} from '@/components/shell/rail-classes';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarRailTooltip,
	SidebarSeparator,
	SidebarTrigger,
	useSidebar,
} from '@/components/ui/sidebar';
import { sidebarToggleLabel } from '@/components/ui/sidebar-toggle-label';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { TOOLS } from '@/config/tools';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useInvitations } from '@/hooks/useInvitations';
import { useSessionBoot } from '@/hooks/useSessionBoot';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import { lastViewedMultisigKey } from '@/lib/localStorageKeys';
import { cn } from '@/lib/utils';

const RESOURCE_LINKS = [
	{
		href: 'https://docs.sui.io/standards/sagat',
		label: 'View docs',
		icon: BookOpen,
	},
	{
		href: 'https://github.com/mystenlabs/sagat',
		label: 'GitHub',
		icon: Github,
	},
] as const;

const MULTISIG_PAGES = [
	{
		id: 'overview',
		label: 'Overview',
		icon: LayoutDashboard,
	},
	{ id: 'proposals', label: 'Proposals', icon: FileText },
	{ id: 'assets', label: 'Assets', icon: Coins },
] as const;

/** Nav label: 13px at 72% white, full white when active (from the designs). */
const navItemClass =
	'text-13 text-sidebar-foreground/70 data-active:text-sidebar-foreground hover:text-sidebar-foreground';

// The short divider between nav groups, shown on the icon rail only.
const separatorClass =
	'mx-auto my-2 hidden w-4 data-[orientation=horizontal]:w-4 group-data-[collapsible=icon]:block';

// On the icon rail, a pill cut out of the icon's top-right corner, shared by
// the invitations count and the external-link arrow. It is pinned by its left
// edge so a longer count grows away from the icon. The `!` on top beats the
// badge primitive's peer-* top rules.
const railCornerClass =
	'group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-0.5! group-data-[collapsible=icon]:right-auto group-data-[collapsible=icon]:left-4.5 group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:ring-1 group-data-[collapsible=icon]:ring-sidebar';

// Beside the label when expanded; the corner pill on the icon rail. The `!`
// on the text colour beats the primitive's peer-* rules, which would
// otherwise win on hover and on the active item.
const invitationsBadgeClass = cn(
	railCornerClass,
	'rounded-full bg-sidebar-accent px-1.5 text-10 text-sidebar-foreground group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:h-3 group-data-[collapsible=icon]:min-w-3 group-data-[collapsible=icon]:bg-sidebar-primary group-data-[collapsible=icon]:px-0.5 group-data-[collapsible=icon]:leading-none group-data-[collapsible=icon]:text-sidebar-primary-foreground!',
);

// Hidden outright on the icon rail: the block only fades labels out and
// pulls them up 32px, which would leave an invisible box over the item above.
const groupLabelClass =
	'h-6 px-2 pb-1 text-10 tracking-[0.04em] text-sidebar-foreground/50 uppercase group-data-[collapsible=icon]:hidden';

export function AppSidebar() {
	// One provider for every rail tooltip, so they open as fast as the
	// tooltips elsewhere instead of after Base UI's default 600ms.
	return (
		<TooltipProvider delay={150}>
			<SidebarNav />
		</TooltipProvider>
	);
}

function SidebarNav() {
	const location = useLocation();
	const { setOpenMobile, state: sidebarState } =
		useSidebar();
	const currentAccount = useCurrentAccount();
	const { holdWalletControls } = useSessionBoot();
	const { isCurrentAddressAuthenticated } = useApiAuth();
	const signedIn =
		!!currentAccount && isCurrentAddressAuthenticated;

	const { data: multisigs, isLoading: multisigsLoading } =
		useUserMultisigs();
	// Restoring the session: wallet reconnecting, the API check running,
	// or the accounts not here yet. Hold the layout with skeletons.
	const booting =
		holdWalletControls || (signedIn && multisigsLoading);
	const { data: invitations } = useInvitations();
	const pendingInvites = invitations?.length ?? 0;

	const match = matchPath(
		'/multisig/:address/:page?',
		location.pathname,
	);
	const routeAddress = match?.params.address;
	const routePage = match?.params.page ?? 'proposals';

	const accepted = useMemo(
		() => multisigs?.filter((m) => m.isAccepted) ?? [],
		[multisigs],
	);
	const lastViewed = currentAccount
		? localStorage.getItem(
				lastViewedMultisigKey(currentAccount.address),
			)
		: null;
	const selected =
		accepted.find((m) => m.address === routeAddress) ??
		accepted.find((m) => m.address === lastViewed) ??
		accepted[0];

	const closeMobile = () => setOpenMobile(false);

	return (
		// Above the sticky test-mode banner: the wallet menu opens out of the
		// rail over the page.
		<Sidebar collapsible="icon" className="z-50">
			<div
				className="flex min-h-0 flex-1 flex-col"
				data-testid="app-header"
			>
				<SidebarHeader className="gap-4 px-2 pt-4 group-data-[collapsible=icon]:gap-2">
					<div className="flex items-center justify-between gap-2 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:px-0">
						<Link
							to="/"
							onClick={closeMobile}
							aria-label="Home"
							className="flex items-center"
						>
							<span className="group-data-[collapsible=icon]:hidden">
								<Logo
									size="sm"
									showSubtitle={false}
									asLink={false}
									onDark
								/>
							</span>
							<span className="hidden group-data-[collapsible=icon]:block">
								<Logo
									size="sm"
									compact
									asLink={false}
									onDark
								/>
							</span>
						</Link>
						<Tooltip>
							<TooltipTrigger
								render={
									<SidebarTrigger
										data-testid="sidebar-toggle"
										className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground max-md:hidden"
									/>
								}
							/>
							<TooltipContent side="right">
								{sidebarToggleLabel(
									sidebarState !== 'collapsed',
								)}
							</TooltipContent>
						</Tooltip>
					</div>
					{booting ? (
						<SwitcherSkeleton />
					) : (
						signedIn && (
							<MultisigSwitcher
								multisigs={accepted}
								selected={selected}
								page={routePage}
								onNavigate={closeMobile}
							/>
						)
					)}
				</SidebarHeader>

				<SidebarContent className="gap-0 px-2 pt-2">
					{booting && <NavSkeleton />}
					{!booting && signedIn && selected && (
						<SidebarGroup className="p-0 pb-5 group-data-[collapsible=icon]:pb-0">
							<SidebarGroupContent>
								<SidebarMenu className="gap-0.5">
									{MULTISIG_PAGES.map((page) => {
										const to = `/multisig/${selected.address}/${page.id}`;
										const active =
											routeAddress === selected.address &&
											routePage === page.id;
										return (
											<SidebarMenuItem key={page.id}>
												<SidebarMenuButton
													isActive={active}
													tooltip={page.label}
													className={navItemClass}
													data-testid={`multisig-tab-${page.id}`}
													render={
														<Link
															to={to}
															onClick={closeMobile}
														/>
													}
												>
													<page.icon />
													<span>{page.label}</span>
												</SidebarMenuButton>
											</SidebarMenuItem>
										);
									})}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					)}

					{signedIn && (
						<SidebarSeparator className={separatorClass} />
					)}
					{signedIn && (
						<SidebarGroup className="p-0 pb-5 group-data-[collapsible=icon]:pb-0">
							<SidebarGroupContent>
								<SidebarMenu className="gap-0.5">
									<SidebarMenuItem>
										<SidebarMenuButton
											isActive={
												location.pathname === '/invitations'
											}
											tooltip="Invitations"
											className={navItemClass}
											data-testid="nav-invitations"
											render={
												<Link
													to="/invitations"
													onClick={closeMobile}
												/>
											}
										>
											<Mail />
											<span>Invitations</span>
										</SidebarMenuButton>
										{pendingInvites > 0 && (
											<SidebarMenuBadge
												className={invitationsBadgeClass}
												data-testid="nav-invitations-count"
											>
												{pendingInvites > 99
													? '99+'
													: pendingInvites}
											</SidebarMenuBadge>
										)}
									</SidebarMenuItem>
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					)}

					<SidebarSeparator className={separatorClass} />
					<SidebarGroup className="p-0 pb-5 group-data-[collapsible=icon]:pb-0">
						<SidebarGroupLabel className={groupLabelClass}>
							Developer
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu className="gap-0.5">
								{TOOLS.map((tool) => (
									<SidebarMenuItem key={tool.id}>
										<SidebarMenuButton
											isActive={
												location.pathname === tool.path
											}
											tooltip={tool.name}
											className={navItemClass}
											render={
												<Link
													to={tool.path}
													onClick={closeMobile}
												/>
											}
										>
											{tool.icon}
											<span>{tool.name}</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>

					<SidebarSeparator className={separatorClass} />
					<SidebarGroup className="p-0">
						<SidebarGroupLabel className={groupLabelClass}>
							Resources
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu className="gap-0.5">
								{RESOURCE_LINKS.map(
									({ href, label, icon: Icon }) => (
										<SidebarMenuItem key={href}>
											<SidebarMenuButton
												tooltip={label}
												className={navItemClass}
												render={
													<a
														href={href}
														target="_blank"
														rel="noreferrer"
													/>
												}
											>
												<Icon />
												<span className="flex-1">
													{label}
												</span>
												<ArrowUpRight
													className={cn(
														railCornerClass,
														'size-3! opacity-60 group-data-[collapsible=icon]:bg-sidebar group-data-[collapsible=icon]:p-px group-data-[collapsible=icon]:opacity-100',
													)}
												/>
											</SidebarMenuButton>
										</SidebarMenuItem>
									),
								)}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>

				<SidebarFooter className="gap-1 px-2 pb-4">
					<SidebarSeparator className="mx-0 mb-2" />
					<NetworkRow />
					<ThemeToggle
						variant="row"
						className={navItemClass}
					/>
					{holdWalletControls ? (
						<WalletRowSkeleton />
					) : (
						<CustomWalletButton variant="rail" />
					)}
				</SidebarFooter>
			</div>
		</Sidebar>
	);
}

/** The footer wallet row while the wallet kit reconnects. */
function WalletRowSkeleton() {
	return (
		<div
			className="flex items-center gap-2.5 p-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
			data-testid="wallet-loading"
		>
			<Skeleton className="size-6 rounded-full bg-sidebar-accent" />
			<Skeleton className="h-2.5 w-24 bg-sidebar-accent group-data-[collapsible=icon]:hidden" />
		</div>
	);
}

/** Three nav rows standing in for the account's pages. */
function NavSkeleton() {
	return (
		<div
			className="flex flex-col gap-0.5 pb-5 group-data-[collapsible=icon]:pb-0"
			aria-hidden
		>
			{[16, 20, 12].map((units) => (
				<SidebarMenuSkeleton
					key={units}
					showIcon
					width={`calc(var(--spacing) * ${units})`}
				/>
			))}
		</div>
	);
}

function NetworkRow() {
	const { network } = useNetwork();

	return (
		<DropdownMenu>
			{/* A plain button: Base UI anchors the menu to the trigger's ref. */}
			<DropdownMenuTrigger
				data-testid="network-menu-button"
				aria-label={`Network: ${network}`}
				render={
					<SidebarRailTooltip
						tooltip={`Network: ${network}`}
					/>
				}
				className={cn(
					'flex h-8 w-full items-center gap-2 rounded-md p-2 text-left data-open:bg-sidebar-accent',
					railTriggerClass,
					railSquareClass,
					navItemClass,
				)}
			>
				<NetworkStatusDot />
				<span className="flex-1 capitalize group-data-[collapsible=icon]:hidden">
					{network}
				</span>
				<ChevronRight className="size-3 opacity-60 group-data-[collapsible=icon]:hidden" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="top"
				align="start"
				className="min-w-40"
			>
				<NetworkMenuItems />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
