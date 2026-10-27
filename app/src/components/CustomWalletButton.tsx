// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useCurrentWallet,
	useDAppKit,
	type UiWalletAccount,
} from '@mysten/dapp-kit-react';
import { formatAddress } from '@mysten/sui/utils';
import {
	Check,
	ChevronDown,
	ChevronRight,
	Copy,
	LogOut,
	Shield,
} from 'lucide-react';

import { cn } from '@/lib/utils';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { useNetwork } from '../contexts/NetworkContext';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { useDefaultSuinsName } from '../hooks/useDefaultSuinsName';
import {
	railSquareClass,
	railTriggerClass,
} from './shell/rail-classes';
import { Button, buttonVariants } from './ui/button';
import { Chip } from './ui/chip';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	menuRowClass,
} from './ui/dropdown-menu';
import { SidebarRailTooltip } from './ui/sidebar';
import { WalletPicker } from './WalletPicker';

type WalletVariant = 'header' | 'rail';

const getCompactWalletLabel = (
	address: string,
	suinsName?: string | null,
) => suinsName ?? formatAddress(address);

const AccountIdentity = ({
	address,
	suinsName,
	label,
}: {
	address: string;
	suinsName?: string | null;
	label?: string;
}) => (
	<span className="flex min-w-0 flex-1 flex-col gap-0.5">
		<span className="truncate font-mono text-12">
			{getCompactWalletLabel(address, suinsName)}
		</span>
		{suinsName && (
			<span className="truncate font-mono text-11 text-muted-foreground">
				{formatAddress(address)}
			</span>
		)}
		{label && (
			<span className="truncate text-11 text-muted-foreground">
				{label}
			</span>
		)}
	</span>
);

const RailAvatar = ({ address }: { address: string }) => (
	<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-11 font-medium text-sidebar-foreground uppercase">
		{address.slice(2, 3)}
	</span>
);

/**
 * The wallet control: the sidebar footer row (`rail`) or the phone header
 * button (`header`). Without a wallet it is the wallet picker; with one, a
 * menu to switch accounts, copy the address and disconnect.
 */
export function CustomWalletButton({
	variant = 'header',
}: {
	variant?: WalletVariant;
}) {
	const currentAccount = useCurrentAccount();

	if (!currentAccount) {
		return variant === 'rail' ? (
			<WalletPicker variant="rail" side="top" />
		) : (
			<WalletPicker
				variant="outline"
				size="sm"
				align="end"
			/>
		);
	}

	return (
		<WalletMenu
			variant={variant}
			account={currentAccount}
		/>
	);
}

function WalletMenu({
	variant,
	account,
}: {
	variant: WalletVariant;
	account: UiWalletAccount;
}) {
	const { data: suinsName } = useDefaultSuinsName(
		account.address,
	);
	const accounts = useCurrentWallet()?.accounts ?? [];
	const {
		isCurrentAddressAuthenticated,
		isAuthCheckFailing,
		disconnectWallet,
	} = useApiAuth();
	const { network, isTestMode } = useNetwork();
	const { copy } = useCopyToClipboard('Address copied');

	const label = getCompactWalletLabel(
		account.address,
		suinsName,
	);
	const triggerProps = {
		'data-testid': 'wallet-menu-button',
		'data-auth-state': isCurrentAddressAuthenticated
			? 'authenticated'
			: 'unauthenticated',
		'data-address': account.address,
	};

	return (
		<DropdownMenu>
			{variant === 'rail' ? (
				<DropdownMenuTrigger
					{...triggerProps}
					aria-label={`Wallet ${label}`}
					render={
						<SidebarRailTooltip
							tooltip={`Wallet ${label}`}
						/>
					}
					className={cn(
						'flex w-full items-center gap-2.5 rounded-md p-2 text-left text-13 text-sidebar-foreground/70 hover:text-sidebar-foreground data-open:bg-sidebar-accent data-open:text-sidebar-foreground',
						railTriggerClass,
						railSquareClass,
					)}
				>
					<RailAvatar address={account.address} />
					<span className="min-w-0 flex-1 truncate font-mono text-12 group-data-[collapsible=icon]:hidden">
						{label}
					</span>
					{isCurrentAddressAuthenticated ? (
						<ChevronRight className="size-3 shrink-0 opacity-60 group-data-[collapsible=icon]:hidden" />
					) : (
						<Shield className="size-3 shrink-0 text-sidebar-warning group-data-[collapsible=icon]:hidden" />
					)}
				</DropdownMenuTrigger>
			) : (
				<DropdownMenuTrigger
					{...triggerProps}
					className={cn(
						buttonVariants({
							variant: 'outline',
							size: 'sm',
						}),
						'gap-2',
					)}
				>
					{isCurrentAddressAuthenticated ? (
						<span className="size-2 rounded-full bg-success-foreground" />
					) : (
						<Shield className="size-3 text-muted-foreground" />
					)}
					<span>{label}</span>
					<Chip
						variant={isTestMode ? 'warning' : 'info'}
						size="sm"
					>
						{network}
					</Chip>
					<ChevronDown className="size-3" />
				</DropdownMenuTrigger>
			)}
			<DropdownMenuContent
				side={variant === 'rail' ? 'top' : 'bottom'}
				align={variant === 'rail' ? 'start' : 'end'}
				className="w-auto min-w-50"
			>
				{accounts.length > 1 && (
					<>
						<DropdownMenuGroup>
							{accounts.map((item) => (
								<AccountItem
									key={item.address}
									account={item}
									isCurrent={
										item.address === account.address
									}
									canSign={!isAuthCheckFailing}
								/>
							))}
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuGroup>
					<DropdownMenuItem
						className={menuRowClass}
						onClick={() => void copy(account.address)}
						// Copying is not a navigation: keep the menu open for a second action; the "Address copied" toast confirms it.
						closeOnClick={false}
						data-testid="copy-address"
					>
						<Copy />
						Copy address
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						variant="destructive"
						className={menuRowClass}
						onClick={() => void disconnectWallet()}
						data-testid="disconnect-button"
					>
						<LogOut />
						Disconnect
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** One of the wallet's accounts: pick it to switch, or sign it in. */
function AccountItem({
	account,
	isCurrent,
	canSign,
}: {
	account: UiWalletAccount;
	isCurrent: boolean;
	// False while the auth check is failing: switching still works,
	// signing would only fail.
	canSign: boolean;
}) {
	const dappKit = useDAppKit();
	const { data: suinsName } = useDefaultSuinsName(
		account.address,
	);
	const {
		authenticatedAddresses,
		signAndConnect,
		isConnecting,
	} = useApiAuth();
	const isAccountAuthenticated =
		authenticatedAddresses.includes(account.address);

	const switchTo = () => {
		if (!isCurrent) dappKit.switchAccount({ account });
	};

	const handleSignClick = () => {
		// Switching is synchronous in dApp Kit, so once it returns the
		// signature request goes to this account. The click then reaches
		// the row, which re-selects the same account (a no-op) and closes
		// the menu like every other item.
		switchTo();
		signAndConnect();
	};

	return (
		<DropdownMenuItem
			className={cn(
				menuRowClass,
				// Taller when the account has a name or label line.
				'h-auto min-h-9 py-1.5',
			)}
			onClick={switchTo}
			data-testid="wallet-account"
			data-address={account.address}
			data-current={isCurrent}
			data-authenticated={isAccountAuthenticated}
		>
			<span
				className="flex min-w-0 flex-1"
				data-testid="wallet-account-switch"
			>
				<AccountIdentity
					address={account.address}
					suinsName={suinsName}
					label={account.label}
				/>
			</span>
			<span className="ml-auto flex shrink-0 items-center gap-2.5">
				{canSign && !isAccountAuthenticated && (
					<Button
						size="xs"
						variant="outline"
						onClick={handleSignClick}
						disabled={isConnecting}
						data-testid="wallet-account-sign"
					>
						{isConnecting && isCurrent
							? 'Signing in…'
							: 'Sign in'}
					</Button>
				)}
				{isCurrent && <Check className="size-4" />}
			</span>
		</DropdownMenuItem>
	);
}
