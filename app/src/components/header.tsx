// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import {
	BookOpen,
	ChevronDown,
	Github,
	Mail,
	Menu,
	Monitor,
	Moon,
	Plus,
	Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { useInvitations } from '../hooks/useInvitations';
import { CustomWalletButton } from './CustomWalletButton';
import { Logo } from './Logo';
import { ToolsDropdown } from './ToolsDropdown';
import { Button } from './ui/button';
import { Label } from './ui/label';
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from './ui/sheet';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from './ui/tooltip';

const RESOURCE_LINKS = [
	{
		href: 'https://docs.sui.io/standards/sagat',
		label: 'Documentation',
		icon: BookOpen,
	},
	{
		href: 'https://github.com/mystenlabs/sagat',
		label: 'GitHub',
		icon: Github,
	},
] as const;

function ResourceLinks() {
	return (
		<TooltipProvider delayDuration={150}>
			<div className="flex items-center gap-1 ml-1 border-l pl-3">
				{RESOURCE_LINKS.map(
					({ href, label, icon: Icon }) => (
						<Tooltip key={href}>
							<TooltipTrigger asChild>
								<a
									href={href}
									target="_blank"
									rel="noreferrer"
								>
									<Button
										variant="ghost"
										size="sm"
										className="px-2 text-muted-foreground"
									>
										<Icon className="w-4 h-4" />
									</Button>
								</a>
							</TooltipTrigger>
							<TooltipContent>{label}</TooltipContent>
						</Tooltip>
					),
				)}
			</div>
		</TooltipProvider>
	);
}

const THEME_OPTIONS = [
	{ value: 'light', icon: Sun, label: 'Light' },
	{ value: 'dark', icon: Moon, label: 'Dark' },
	{ value: 'system', icon: Monitor, label: 'System' },
] as const;

function ThemeToggle({
	mobile = false,
}: {
	mobile?: boolean;
}) {
	const { theme, setTheme } = useTheme();
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClick = (e: MouseEvent) => {
			if (
				ref.current &&
				!ref.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClick);
		return () =>
			document.removeEventListener(
				'mousedown',
				handleClick,
			);
	}, []);

	const active =
		THEME_OPTIONS.find((o) => o.value === theme) ??
		THEME_OPTIONS[2];
	const ActiveIcon = active.icon;

	if (mobile) {
		return (
			<div className="flex flex-col gap-2">
				{THEME_OPTIONS.map(
					({ value, icon: Icon, label }) => (
						<Button
							key={value}
							variant={
								theme === value ? 'default' : 'outline'
							}
							className="w-full justify-start"
							onClick={() => setTheme(value)}
						>
							<Icon className="w-4 h-4 mr-2" />
							{label}
						</Button>
					),
				)}
			</div>
		);
	}

	return (
		<div className="relative border-l pl-3 ml-1" ref={ref}>
			<Button
				variant="ghost"
				size="sm"
				className="px-2 text-muted-foreground gap-1"
				onClick={() => setOpen((v) => !v)}
			>
				<ActiveIcon className="w-4 h-4" />
				<ChevronDown
					className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
				/>
			</Button>

			{open && (
				<div className="absolute right-0 mt-1 bg-popover border rounded-lg shadow-lg py-1 z-50 min-w-32">
					{THEME_OPTIONS.map(
						({ value, icon: Icon, label }) => (
							<button
								key={value}
								onClick={() => {
									setTheme(value);
									setOpen(false);
								}}
								className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm cursor-pointer hover:bg-accent transition-colors ${
									theme === value
										? 'text-foreground font-medium'
										: 'text-muted-foreground'
								}`}
							>
								<Icon className="w-4 h-4" />
								{label}
							</button>
						),
					)}
				</div>
			)}
		</div>
	);
}

const NavigationLinks = ({
	mobile = false,
	onNavigate = () => {},
}: {
	mobile?: boolean;
	onNavigate?: () => void;
}) => {
	const currentAccount = useCurrentAccount();
	const { isCurrentAddressAuthenticated } = useApiAuth();
	const { data: invitations } = useInvitations();
	const pendingCount = invitations?.length ?? 0;
	const location = useLocation();

	return (
		<>
			{!mobile && (
				<ToolsDropdown
					mobile={false}
					onNavigate={onNavigate}
				/>
			)}
			{currentAccount && isCurrentAddressAuthenticated && (
				<>
					{/* Invitations button */}
					<Link to="/invitations" onClick={onNavigate}>
						<Button
							variant={
								location.pathname === '/invitations'
									? 'default'
									: 'outline'
							}
							size={mobile ? 'default' : 'sm'}
							className={`relative ${mobile ? 'w-full justify-start' : ''}`}
						>
							<Mail className="w-4 h-4 mr-2" />
							Invitations
							{pendingCount > 0 && (
								<Label
									variant="warning"
									size="sm"
									className={`absolute ${mobile ? 'top-2 right-2' : '-top-1 -right-1'} bg-orange-500 text-white h-5 w-5 p-0 justify-center`}
								>
									{pendingCount}
								</Label>
							)}
						</Button>
					</Link>

					{/* Create multisig button */}
					<Link to="/create" onClick={onNavigate}>
						<Button
							variant={
								location.pathname === '/create'
									? 'default'
									: 'outline'
							}
							size={mobile ? 'default' : 'sm'}
							className={
								mobile ? 'w-full justify-start' : ''
							}
						>
							<Plus className="w-4 h-4 mr-2" />
							Create Multisig
						</Button>
					</Link>
				</>
			)}
			{mobile && (
				<>
					<p className="text-sm text-muted-foreground font-medium px-2">
						Tools
					</p>
					<ToolsDropdown
						mobile={true}
						onNavigate={onNavigate}
					/>

					<p className="text-sm text-muted-foreground font-medium px-2 mt-4">
						Resources
					</p>
					{RESOURCE_LINKS.map(
						({ href, label, icon: Icon }) => (
							<a
								key={href}
								href={href}
								target="_blank"
								rel="noreferrer"
							>
								<Button
									variant="outline"
									className="w-full justify-start"
								>
									<Icon className="w-4 h-4 mr-2" />
									{label}
								</Button>
							</a>
						),
					)}

					<p className="text-sm text-muted-foreground font-medium px-2 mt-4">
						Theme
					</p>
					<ThemeToggle mobile />
				</>
			)}
		</>
	);
};

export function Header() {
	const { data: invitations } = useInvitations();
	const [sheetOpen, setSheetOpen] = useState(false);

	// Count pending invitations
	const pendingCount = invitations?.length ?? 0;

	return (
		<div className="border-b">
			<div className="p-4 max-w-[1600px] mx-auto flex justify-between items-center">
				{/* Logo - hide subtitle on mobile */}
				<div className="block lg:hidden">
					<Logo showSubtitle={false} size="sm" />
				</div>
				<div className="hidden lg:block">
					<Logo />
				</div>

				{/* Desktop Navigation */}
				<div className="hidden lg:flex items-center gap-4">
					<NavigationLinks />
					<CustomWalletButton />
					<ResourceLinks />
					<ThemeToggle />
				</div>

				{/* Mobile Navigation */}
				<div className="flex lg:hidden items-center gap-2">
					<CustomWalletButton variant="header" />

					<Sheet
						open={sheetOpen}
						onOpenChange={setSheetOpen}
					>
						<SheetTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="relative"
							>
								<Menu className="w-4 h-4" />
								{pendingCount > 0 && (
									<Label
										variant="warning"
										size="sm"
										className="absolute -top-1 -right-1 bg-orange-500 text-white h-4 w-4 p-0 justify-center"
									>
										{pendingCount}
									</Label>
								)}
							</Button>
						</SheetTrigger>
						<SheetContent
							side="right"
							className="w-[300px] sm:w-[350px]"
						>
							<SheetHeader>
								<SheetTitle>Navigation</SheetTitle>
							</SheetHeader>
							<div className="mt-8 flex flex-col gap-4 px-2">
								<NavigationLinks
									mobile
									onNavigate={() => setSheetOpen(false)}
								/>
							</div>
						</SheetContent>
					</Sheet>
				</div>
			</div>
		</div>
	);
}
