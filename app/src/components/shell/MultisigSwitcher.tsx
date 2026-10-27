// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { formatAddress } from '@mysten/sui/utils';
import {
	ArrowDownToLine,
	Check,
	ChevronsUpDown,
	Plus,
	TriangleAlert,
	Users,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
	railSquareClass,
	railTriggerClass,
} from '@/components/shell/rail-classes';
import { ReceiveDialog } from '@/components/shell/ReceiveDialog';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarRailTooltip } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { accountName } from '@/lib/account-name';
import {
	accountStatus,
	type AccountStatus,
} from '@/lib/account-status';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

// The status colours per surface. The sidebar is black in both themes and
// has its own tokens; the menu is a popover and takes the theme's, with `!`
// to beat the item's focus rule, which otherwise recolours every descendant.
// The icon is filled in the status colour, its mark cut out in the tile's.
const SURFACE = {
	sidebar: {
		text: {
			warning: 'text-sidebar-warning',
			error: 'text-sidebar-error',
		},
		icon: {
			warning:
				'fill-sidebar-warning stroke-sidebar-primary',
			error: 'fill-sidebar-error stroke-sidebar-primary',
		},
	},
	menu: {
		text: {
			warning: 'text-warning-foreground!',
			error: 'text-error-foreground!',
		},
		icon: {
			warning: 'fill-warning-foreground stroke-secondary',
			error: 'fill-error-foreground stroke-secondary',
		},
	},
} as const;

type StatusSurface = keyof typeof SURFACE;

/** The account's tile icon: the signers icon, or the warning triangle. */
function AccountIcon({
	status,
	surface,
	className,
}: {
	status: AccountStatus;
	surface: StatusSurface;
	className?: string;
}) {
	if (status.tone === 'ok')
		return <Users className={className} />;
	return (
		<TriangleAlert
			className={cn(
				SURFACE[surface].icon[status.tone],
				className,
			)}
		/>
	);
}

/**
 * Under the account's name: its short address, styled by
 * `addressClassName`, or the status sentence in the warning or error
 * colour. Never the threshold, per the designs.
 */
function AccountSubtitle({
	status,
	address,
	surface,
	addressClassName,
	testId,
}: {
	status: AccountStatus;
	address: string;
	surface: StatusSurface;
	addressClassName?: string;
	testId?: string;
}) {
	return (
		<span
			className={cn(
				'text-11',
				status.tone === 'ok'
					? cn('truncate', addressClassName)
					: cn(
							'leading-snug',
							SURFACE[surface].text[status.tone],
						),
			)}
			data-testid={testId}
			data-tone={status.tone}
		>
			{status.tone === 'ok'
				? formatAddress(address)
				: status.message}
		</span>
	);
}

/**
 * The switcher's tile: the account square, the text beside it and an
 * optional trailing mark. `render` swaps the row element, as the menu
 * trigger does.
 */
function SwitcherTile({
	icon,
	trailing,
	children,
	className,
	render,
	...props
}: useRender.ComponentProps<'div'> & {
	icon: ReactNode;
	trailing?: ReactNode;
}) {
	return useRender({
		defaultTagName: 'div',
		render,
		props: mergeProps<'div'>(
			{
				className: cn(
					'flex w-full items-center gap-2.5 rounded-lg bg-sidebar-accent/60 p-2.5 text-sidebar-foreground',
					railSquareClass,
					className,
				),
				children: (
					<>
						<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
							{icon}
						</span>
						{children}
						{trailing}
					</>
				),
			},
			props,
		),
	});
}

export function MultisigSwitcher({
	multisigs,
	selected,
	page,
	onNavigate,
}: {
	multisigs: MultisigWithMembersForPublicKey[];
	selected: MultisigWithMembersForPublicKey;
	page: string;
	onNavigate: () => void;
}) {
	const navigate = useNavigate();
	const [receiveOpen, setReceiveOpen] = useState(false);
	const go = (to: string) => {
		navigate(to);
		onNavigate();
	};
	const selectedStatus = accountStatus(selected);
	// On the icon rail only the tile shows, so the tooltip carries the status.
	const tooltip =
		selectedStatus.tone === 'ok'
			? accountName(selected)
			: `${accountName(selected)} · ${selectedStatus.message}`;

	return (
		<div className="flex flex-col gap-2.5">
			<DropdownMenu>
				<SwitcherTile
					render={
						<DropdownMenuTrigger
							data-testid="multisig-switcher"
							data-tone={selectedStatus.tone}
							render={
								<SidebarRailTooltip tooltip={tooltip} />
							}
						/>
					}
					className={cn(
						'text-left data-open:bg-sidebar-accent',
						railTriggerClass,
					)}
					icon={
						<AccountIcon
							status={selectedStatus}
							surface="sidebar"
							className="size-4"
						/>
					}
					trailing={
						<ChevronsUpDown className="size-3.5 shrink-0 opacity-60 group-data-[collapsible=icon]:hidden" />
					}
				>
					<span className="flex min-w-0 flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:sr-only">
						<span className="truncate text-13 font-medium">
							{accountName(selected)}
						</span>
						<AccountSubtitle
							status={selectedStatus}
							address={selected.address}
							surface="sidebar"
							addressClassName="tracking-[0.04em] text-sidebar-foreground/60"
							testId="multisig-switcher-subtitle"
						/>
					</span>
				</SwitcherTile>
				<DropdownMenuContent
					align="start"
					className="w-(--anchor-width) min-w-56"
				>
					<DropdownMenuGroup>
						<DropdownMenuLabel>Multisigs</DropdownMenuLabel>
						{multisigs.map((m) => {
							const status = accountStatus(m);
							const isSelected =
								m.address === selected.address;
							return (
								<DropdownMenuItem
									key={m.address}
									data-testid="multisig-switcher-option"
									data-address={m.address}
									data-tone={status.tone}
									onClick={() =>
										go(`/multisig/${m.address}/${page}`)
									}
									className={cn(
										'items-center gap-2.5',
										isSelected && 'bg-accent',
									)}
								>
									<span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
										<AccountIcon
											status={status}
											surface="menu"
											className="size-3.5"
										/>
									</span>
									<span className="flex min-w-0 flex-1 flex-col gap-px">
										<span className="truncate text-13 font-medium">
											{accountName(m)}
										</span>
										<AccountSubtitle
											status={status}
											address={m.address}
											surface="menu"
											addressClassName="font-mono text-muted-foreground"
										/>
									</span>
									{isSelected && (
										<Check className="size-4 shrink-0 opacity-60" />
									)}
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => go('/create')}>
						<Plus />
						New multisig
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Button
				variant="secondary"
				size="sm"
				className="w-full group-data-[collapsible=icon]:hidden"
				onClick={() => setReceiveOpen(true)}
				data-testid="receive-button"
			>
				<ArrowDownToLine />
				Receive
			</Button>
			<ReceiveDialog
				open={receiveOpen}
				onClose={() => setReceiveOpen(false)}
				address={selected.address}
				name={accountName(selected)}
			/>
		</div>
	);
}

/**
 * The switcher's slot for someone in no accounts yet: the same tile, not a
 * menu, and a button to create the first one.
 */
export function NoAccountsSwitcher({
	onNavigate,
}: {
	onNavigate: () => void;
}) {
	return (
		<div className="flex flex-col gap-2.5">
			<SwitcherTile
				render={
					<SidebarRailTooltip
						tooltip="No accounts yet"
						render={<div tabIndex={-1} />}
					/>
				}
				className="group-data-[collapsible=icon]:bg-transparent"
				data-testid="multisig-switcher-empty"
				icon={<Users className="size-4" />}
			>
				<span className="truncate text-13 font-medium group-data-[collapsible=icon]:sr-only">
					No accounts yet
				</span>
			</SwitcherTile>
			<Button
				variant="secondary"
				size="sm"
				className="w-full group-data-[collapsible=icon]:hidden"
				render={<Link to="/create" onClick={onNavigate} />}
				nativeButton={false}
				data-testid="create-account-button"
			>
				<Plus />
				Create an account
			</Button>
		</div>
	);
}

/** The switcher's footprint while the session is being restored. */
export function SwitcherSkeleton() {
	return (
		<div
			className="flex flex-col gap-2.5"
			data-testid="sidebar-loading"
			aria-busy
		>
			<div className="flex items-center gap-2.5 rounded-lg bg-sidebar-accent/60 p-2.5 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
				<Skeleton className="size-7 rounded-md bg-sidebar-accent" />
				<div className="flex flex-1 flex-col gap-1.5 group-data-[collapsible=icon]:hidden">
					<Skeleton className="h-2.5 w-28 bg-sidebar-accent" />
					<Skeleton className="h-2 w-20 bg-sidebar-accent" />
				</div>
			</div>
			<Skeleton className="h-7 w-full rounded-md bg-sidebar-accent/60 group-data-[collapsible=icon]:hidden" />
		</div>
	);
}
