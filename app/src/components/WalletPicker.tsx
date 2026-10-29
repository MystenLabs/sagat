// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useWallets } from '@mysten/dapp-kit-react';
import { ChevronDown, Wallet } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarRailTooltip } from '@/components/ui/sidebar';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useAuthLevel } from '@/hooks/useAuthLevel';
import { cn } from '@/lib/utils';

const LABEL = 'Connect wallet';

type WalletPickerVariant = 'default' | 'outline' | 'rail';

/**
 * "Connect wallet": a menu of the installed wallets. Picking one connects
 * it; where the route needs an API session, the connect card then offers
 * Sign in. The `rail` variant is the sidebar footer's, a square icon on the
 * collapsed rail.
 */
export function WalletPicker({
	variant = 'default',
	size = 'default',
	side = 'bottom',
	align = 'start',
}: {
	variant?: WalletPickerVariant;
	size?: 'default' | 'sm';
	side?: 'top' | 'bottom';
	align?: 'start' | 'center' | 'end';
}) {
	const wallets = useWallets();
	const { connectWallet } = useApiAuth();
	const level = useAuthLevel();
	const rail = variant === 'rail';

	return (
		<DropdownMenu>
			{/* The trigger is the button itself: Base UI anchors the menu to its ref. */}
			<DropdownMenuTrigger
				data-testid="connect-wallet-button"
				aria-label={LABEL}
				render={
					rail ? (
						<SidebarRailTooltip tooltip={LABEL} />
					) : undefined
				}
				className={cn(
					buttonVariants({
						variant: rail ? 'secondary' : variant,
						size: rail ? 'sm' : size,
					}),
					rail &&
						'w-full group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0',
				)}
			>
				<Wallet className={cn(rail && 'size-3.5')} />
				<span
					className={cn(
						rail && 'group-data-[collapsible=icon]:hidden',
					)}
				>
					{LABEL}
				</span>
				<ChevronDown
					className={cn(
						rail &&
							'size-3.5 group-data-[collapsible=icon]:hidden',
					)}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side={side}
				align={align}
				className="w-auto min-w-50"
			>
				<DropdownMenuGroup>
					{wallets.map((wallet) => (
						<DropdownMenuItem
							key={wallet.name}
							onClick={() =>
								void connectWallet(wallet, {
									notice:
										level === 'public' ? 'toast' : 'card',
								})
							}
							data-testid="wallet-option"
							data-wallet-name={wallet.name}
						>
							<img
								src={wallet.icon}
								alt=""
								className="size-4 rounded-sm"
							/>
							{wallet.name}
						</DropdownMenuItem>
					))}
					{wallets.length === 0 && (
						<DropdownMenuItem
							disabled
							// Wraps onto several lines, so it outgrows the fixed row height.
							className="h-auto max-w-60 py-2 text-muted-foreground"
							data-testid="wallet-option-empty"
						>
							No wallets found. Install a wallet (e.g. Slush
							Wallet) to continue.
						</DropdownMenuItem>
					)}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
