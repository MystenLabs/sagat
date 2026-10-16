// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { formatAddress } from '@mysten/sui/utils';
import {
	ArrowDownToLine,
	ArrowUpRight,
	BookOpen,
	ChevronRight,
	ChevronsUpDown,
	Coins,
	FileText,
	Github,
	LayoutDashboard,
	Mail,
	Plus,
	Users,
} from 'lucide-react';
import { useMemo } from 'react';
import {
	Link,
	matchPath,
	useLocation,
	useNavigate,
} from 'react-router-dom';

import { CustomWalletButton } from '@/components/CustomWalletButton';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
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
	SidebarSeparator,
	useSidebar,
} from '@/components/ui/sidebar';
import { TOOLS } from '@/config/tools';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useInvitations } from '@/hooks/useInvitations';
import { useUserMultisigs } from '@/hooks/useUserMultisigs';
import { LocalStorageKeys } from '@/lib/localStorageKeys';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
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

const NETWORKS = [
	'mainnet',
	'testnet',
	'devnet',
	...(import.meta.env.VITE_LOCALNET_RPC_URL
		? (['localnet'] as const)
		: []),
] as const;

/** Nav label: 13px at 72% white, full white when active (from the designs). */
const navItemClass =
	'text-13 text-sidebar-foreground/70 data-active:text-sidebar-foreground hover:text-sidebar-foreground';

export function AppSidebar() {
	const location = useLocation();
	const { setOpenMobile } = useSidebar();
	const currentAccount = useCurrentAccount();
	const { isCurrentAddressAuthenticated } = useApiAuth();
	const signedIn =
		!!currentAccount && isCurrentAddressAuthenticated;

	const { data: multisigs } = useUserMultisigs();
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
				`lastViewedMultisig_${currentAccount.address}`,
			)
		: null;
	const selected =
		accepted.find((m) => m.address === routeAddress) ??
		accepted.find((m) => m.address === lastViewed) ??
		accepted[0];

	const closeMobile = () => setOpenMobile(false);

	return (
		<Sidebar collapsible="icon">
			<div
				className="flex min-h-0 flex-1 flex-col"
				data-testid="app-header"
			>
				<SidebarHeader className="gap-4 px-2 pt-5">
					<Link
						to="/"
						onClick={closeMobile}
						className="px-2 text-15 font-bold tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:text-center"
					>
						<span className="group-data-[collapsible=icon]:hidden">
							Sagat
						</span>
						<span className="hidden group-data-[collapsible=icon]:inline">
							S
						</span>
					</Link>
					{signedIn && (
						<MultisigSwitcher
							multisigs={accepted}
							selected={selected}
							page={routePage}
							onNavigate={closeMobile}
						/>
					)}
				</SidebarHeader>

				<SidebarContent className="px-2 pt-2">
					{signedIn && selected && (
						<SidebarGroup className="p-0">
							<SidebarGroupContent>
								<SidebarMenu>
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
						<SidebarGroup className="p-0">
							<SidebarGroupContent>
								<SidebarMenu>
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
												className="rounded-full bg-sidebar-accent px-1.5 text-10 text-sidebar-foreground"
												data-testid="nav-invitations-count"
											>
												{pendingInvites}
											</SidebarMenuBadge>
										)}
									</SidebarMenuItem>
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					)}

					<SidebarGroup className="p-0">
						<SidebarGroupLabel className="px-2 text-10 tracking-[0.04em] text-sidebar-foreground/50 uppercase">
							Developer
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
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

					<SidebarGroup className="p-0">
						<SidebarGroupLabel className="px-2 text-10 tracking-[0.04em] text-sidebar-foreground/50 uppercase">
							Resources
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
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
												<ArrowUpRight className="size-3! opacity-60" />
											</SidebarMenuButton>
										</SidebarMenuItem>
									),
								)}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>

				<SidebarFooter className="gap-0 px-2 pb-4">
					<SidebarSeparator className="mx-0 mb-2" />
					<NetworkRow />
					<CustomWalletButton variant="rail" />
				</SidebarFooter>
			</div>
		</Sidebar>
	);
}

function MultisigSwitcher({
	multisigs,
	selected,
	page,
	onNavigate,
}: {
	multisigs: MultisigWithMembersForPublicKey[];
	selected?: MultisigWithMembersForPublicKey;
	page: string;
	onNavigate: () => void;
}) {
	const navigate = useNavigate();
	const { copied, copy } = useCopyToClipboard(
		'Address copied',
	);
	const go = (to: string) => {
		navigate(to);
		onNavigate();
	};
	const name = (m: MultisigWithMembersForPublicKey) =>
		m.name || formatAddress(m.address);

	return (
		<div className="flex flex-col gap-2.5">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<button
							type="button"
							data-testid="multisig-switcher"
							className="flex w-full items-center gap-2.5 rounded-lg bg-sidebar-accent/60 p-2.5 text-left text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
						/>
					}
				>
					<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
						{selected ? (
							<Users className="size-4" />
						) : (
							<Plus className="size-4" />
						)}
					</span>
					<span className="flex min-w-0 flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
						<span className="truncate text-13 font-medium">
							{selected ? name(selected) : 'New multisig'}
						</span>
						<span className="truncate text-11 tracking-[0.04em] text-sidebar-foreground/60">
							{selected
								? `${selected.threshold} of ${selected.totalMembers} · ${formatAddress(selected.address)}`
								: 'Not created yet'}
						</span>
					</span>
					<ChevronsUpDown className="size-3.5 shrink-0 opacity-60 group-data-[collapsible=icon]:hidden" />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="w-(--anchor-width) min-w-56"
				>
					{multisigs.length > 0 && (
						<>
							<DropdownMenuLabel>
								Multisigs
							</DropdownMenuLabel>
							{multisigs.map((m) => (
								<DropdownMenuItem
									key={m.address}
									data-testid="multisig-switcher-option"
									data-address={m.address}
									onClick={() =>
										go(`/multisig/${m.address}/${page}`)
									}
									className={cn(
										'flex-col items-start gap-0',
										m.address === selected?.address &&
											'bg-accent',
									)}
								>
									<span className="text-13 font-medium">
										{name(m)}
									</span>
									<span className="font-mono text-11 text-muted-foreground">
										{formatAddress(m.address)}
									</span>
								</DropdownMenuItem>
							))}
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuItem onClick={() => go('/create')}>
						<Plus />
						New multisig
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{selected && (
				<Button
					variant="secondary"
					size="sm"
					className="w-full group-data-[collapsible=icon]:hidden"
					onClick={() => copy(selected.address)}
				>
					<ArrowDownToLine />
					{copied ? 'Address copied' : 'Receive'}
				</Button>
			)}
		</div>
	);
}

function NetworkRow() {
	const dappKit = useDAppKit();
	const { network, isTestMode } = useNetwork();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<SidebarMenuButton
						tooltip="Network"
						className={navItemClass}
						data-testid="network-menu-button"
					/>
				}
			>
				<span
					className={cn(
						'size-2 shrink-0 rounded-full',
						isTestMode
							? 'bg-warning-foreground'
							: 'bg-success-foreground',
					)}
				/>
				<span className="flex-1 capitalize group-data-[collapsible=icon]:hidden">
					{network}
				</span>
				<ChevronRight className="size-3! opacity-60 group-data-[collapsible=icon]:hidden" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="top"
				align="start"
				className="min-w-40"
			>
				<DropdownMenuLabel>Network</DropdownMenuLabel>
				{NETWORKS.map((value) => (
					<DropdownMenuItem
						key={value}
						className={cn(
							'capitalize',
							value === network && 'bg-accent',
						)}
						onClick={() => {
							dappKit.switchNetwork(value);
							localStorage.setItem(
								LocalStorageKeys.SuiNetwork,
								value,
							);
						}}
					>
						{value}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
