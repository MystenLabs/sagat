// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useAccounts,
	useConnectWallet,
	useCurrentAccount,
	useDisconnectWallet,
	useSwitchAccount,
	useWallets,
} from '@mysten/dapp-kit';
import { formatAddress } from '@mysten/sui/utils';
import { type WalletAccount } from '@wallet-standard/base';
import {
	AlertTriangle,
	ArrowRight,
	Check,
	ChevronDown,
	Copy,
	Globe,
	LogOut,
	Shield,
	Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { useNetwork } from '../contexts/NetworkContext';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Switch } from './ui/switch';

type WalletVariant = 'header' | 'sidebar';

interface CustomWalletButtonProps {
	variant?: WalletVariant;
	disableAccountSwitching?: boolean;
}

// Helper component for account list items
interface AccountItemProps {
	account: WalletAccount;
	currentAccount: WalletAccount | null;
	authenticatedAddresses: string[];
	onSwitchAccount: (account: WalletAccount) => void;
	onSignAndConnect: () => void;
	isConnecting: boolean;
}

export function CustomWalletButton({
	variant = 'header',
}: CustomWalletButtonProps) {
	const currentAccount = useCurrentAccount();
	const accounts = useAccounts();
	const { mutate: connect } = useConnectWallet();
	const { mutate: disconnect } = useDisconnectWallet();
	const { mutate: switchAccount } = useSwitchAccount();
	const wallets = useWallets();
	const {
		isCurrentAddressAuthenticated,
		signAndConnect,
		isConnecting,
		disconnect: apiDisconnect,
	} = useApiAuth();
	const { network, isTestMode } = useNetwork();
	const [showWallets, setShowWallets] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const { copied, copy: copyAddress } =
		useCopyToClipboard();

	// Close dropdown when clicking outside
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setShowWallets(false);
			}
		}

		document.addEventListener(
			'mousedown',
			handleClickOutside,
		);
		return () => {
			document.removeEventListener(
				'mousedown',
				handleClickOutside,
			);
		};
	}, []);

	const handleSwitchAccount = (account: WalletAccount) => {
		if (account.address !== currentAccount?.address) {
			switchAccount({ account });
		}
		setShowWallets(false);
	};

	const handleWalletConnect = (walletName: string) => {
		connect(
			{
				wallet: wallets.find((w) => w.name === walletName)!,
			},
			{
				onSuccess: () => setShowWallets(false),
				onError: (error) => toast.error(error.message),
			},
		);
	};

	const handleFullDisconnect = async () => {
		try {
			await apiDisconnect();
			disconnect();
			setShowWallets(false);
		} catch {
			disconnect();
			setShowWallets(false);
		}
	};

	// No wallet connected
	if (!currentAccount) {
		return (
			<NotConnectedWalletVariant
				showWallets={showWallets}
				setShowWallets={setShowWallets}
				handleWalletConnect={handleWalletConnect}
				dropdownRef={dropdownRef}
			/>
		);
	}

	// Wallet connected but not authenticated
	if (!isCurrentAddressAuthenticated) {
		// For header variant, still show the dropdown but with auth prompt
		return (
			<div className="relative" ref={dropdownRef}>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setShowWallets(!showWallets)}
					className="flex items-center gap-2"
				>
					<Shield className="w-3 h-3 text-blue-600" />
					<span>
						{formatAddress(currentAccount.address)}
					</span>
					<Label
						variant={isTestMode ? 'warning' : 'info'}
						size="sm"
					>
						{network}
					</Label>
					<ChevronDown className="w-3 h-3" />
				</Button>

				{showWallets && (
					<div className="absolute top-full mt-1 right-0 bg-white border rounded-lg shadow-lg py-2 min-w-64 z-50">
						<div className="px-3 pb-2 border-b text-center">
							<p className="text-sm font-medium text-blue-700">
								Authentication Required
							</p>
						</div>

						{accounts.length > 1 ? (
							<AccountSwitchingSection
								showTitle={false}
								handleSwitchAccount={handleSwitchAccount}
								handleSignAndConnect={signAndConnect}
								isConnecting={isConnecting}
							/>
						) : (
							<div className="px-3 pt-3">
								<Button
									onClick={signAndConnect}
									disabled={isConnecting}
									size="sm"
									className="w-full mb-2"
								>
									{isConnecting ? (
										<>
											<div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2" />
											Signing...
										</>
									) : (
										<>
											Sign Message
											<ArrowRight className="ml-2 h-3 w-3" />
										</>
									)}
								</Button>
							</div>
						)}

						<Divider />
						<CopyAddressButton />
						<Divider />
						<NetworkSwitchingSection />
						<Divider />
						<DisconnectButton
							setShowWallets={setShowWallets}
						/>
					</div>
				)}
			</div>
		);
	}

	// Wallet connected and authenticated
	if (variant === 'sidebar') {
		return (
			<div className="mt-8 p-4 bg-white rounded-lg border border-slate-200">
				<div className="text-center">
					<div className="w-6 h-6 bg-green-100 rounded-full mx-auto mb-3 flex items-center justify-center">
						<div className="w-2 h-2 bg-green-500 rounded-full"></div>
					</div>
					<h3 className="font-medium text-slate-900 mb-2">
						Wallet Connected
					</h3>
					<p className="text-sm text-slate-600 mb-3">
						{formatAddress(currentAccount.address)}
					</p>
					<div className="flex gap-2">
						<Button
							onClick={() =>
								currentAccount?.address &&
								copyAddress(currentAccount.address)
							}
							variant="outline"
							size="sm"
							className="flex-1 text-xs"
						>
							{copied ? (
								<Check className="w-3 h-3 mr-1" />
							) : (
								<Copy className="w-3 h-3 mr-1" />
							)}
							{copied ? 'Copied!' : 'Copy'}
						</Button>
						<Button
							onClick={handleFullDisconnect}
							variant="outline"
							size="sm"
							className="flex-1 text-xs hover:text-red-600 hover:border-red-200"
						>
							<LogOut className="w-3 h-3 mr-1" />
							Disconnect
						</Button>
					</div>
				</div>
			</div>
		);
	}

	// Header variant - authenticated
	return (
		<div className="relative" ref={dropdownRef}>
			<Button
				variant="outline"
				size="sm"
				onClick={() => setShowWallets(!showWallets)}
				className="flex items-center gap-2"
			>
				<div className="w-2 h-2 bg-green-500 rounded-full"></div>
				<span>{formatAddress(currentAccount.address)}</span>
				<Label
					variant={isTestMode ? 'warning' : 'info'}
					size="sm"
				>
					{network}
				</Label>
				<ChevronDown className="w-3 h-3" />
			</Button>

			{showWallets && (
				<div className="absolute top-full mt-1 right-0 bg-white border rounded-lg shadow-lg py-2 min-w-64 z-50">
					{accounts.length > 1 && (
						<AccountSwitchingSection
							handleSwitchAccount={handleSwitchAccount}
							handleSignAndConnect={signAndConnect}
							isConnecting={isConnecting}
						/>
					)}
					<CopyAddressButton />
					<Divider />
					<NetworkSwitchingSection />
					<Divider />
					<DisconnectButton
						setShowWallets={setShowWallets}
					/>
				</div>
			)}
		</div>
	);
}

const CopyAddressButton = () => {
	const currentAccount = useCurrentAccount();
	const { copied, copy: copyAddress } =
		useCopyToClipboard();

	return (
		<Button
			size="sm"
			variant="ghost"
			onClick={() =>
				currentAccount?.address &&
				copyAddress(currentAccount.address)
			}
			className="w-full justify-start rounded-none"
		>
			{copied ? (
				<Check className="w-4 h-4" />
			) : (
				<Copy className="w-4 h-4" />
			)}
			{copied ? 'Copied!' : 'Copy Address'}
		</Button>
	);
};

const AccountItem = ({
	account,
	currentAccount,
	authenticatedAddresses,
	onSwitchAccount,
	onSignAndConnect,
	isConnecting,
}: AccountItemProps) => {
	const isCurrent =
		account.address === currentAccount?.address;
	const isAccountAuthenticated =
		authenticatedAddresses.includes(account.address);

	const handleSignClick = () => {
		// If not current account, switch to it first
		if (!isCurrent) {
			onSwitchAccount(account);
			// Give a small delay for the account switch to complete
			setTimeout(() => {
				onSignAndConnect();
			}, 100);
		} else {
			// Already on this account, just sign
			onSignAndConnect();
		}
	};

	return (
		<div
			className={`flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 w-full ${
				isCurrent ? 'bg-blue-50 text-blue-700' : ''
			}`}
		>
			<button
				onClick={() => onSwitchAccount(account)}
				className="flex-1 text-left min-w-0"
			>
				<div className="flex-1 min-w-0">
					<p className="font-mono text-xs truncate">
						{formatAddress(account.address)}
					</p>
					{account.label && (
						<p className="text-xs text-gray-500 mt-1 truncate">
							{account.label}
						</p>
					)}
				</div>
			</button>

			<div className="flex items-center ml-2 space-x-1">
				{isCurrent && (
					<div className="w-2 h-2 bg-blue-500 rounded-full"></div>
				)}
				{!isAccountAuthenticated && (
					<Button
						size="sm"
						variant="outline"
						onClick={handleSignClick}
						disabled={isConnecting}
						className="text-xs px-1.5 py-1 h-6 flex items-center gap-1"
					>
						<Shield className="w-2.5 h-2.5" />
						{isConnecting && isCurrent
							? 'Signing...'
							: 'Sign'}
					</Button>
				)}
			</div>
		</div>
	);
};

const DisconnectButton = ({
	setShowWallets,
}: {
	setShowWallets: (show: boolean) => void;
}) => {
	const { mutate: disconnect } = useDisconnectWallet();
	const { disconnect: apiDisconnect } = useApiAuth();

	const handleFullDisconnect = async () => {
		try {
			await apiDisconnect();
			disconnect();
			setShowWallets(false);
		} catch {
			disconnect();
			setShowWallets(false);
		}
	};
	return (
		<Button
			onClick={handleFullDisconnect}
			variant="ghost"
			size="sm"
			className="w-full justify-start text-red-600 hover:text-red-500 rounded-none"
		>
			<LogOut className="w-4 h-4" />
			Disconnect
		</Button>
	);
};

// A divider for the dropdown.
const Divider = () => <div className="border-t my-1"></div>;

// A network switcher for the test mode.
const NetworkSwitchingSection = () => {
	const { isTestMode, setNetwork } = useNetwork();
	return (
		<>
			<div className="flex items-center justify-between px-3 py-2 text-sm">
				<div className="flex items-center gap-2">
					<Globe className="w-4 h-4" />
					<span className="font-medium">Test Mode</span>
				</div>
				<Switch
					checked={isTestMode}
					onCheckedChange={(checked) =>
						setNetwork(checked ? 'testnet' : 'mainnet')
					}
					className="scale-75"
				/>
			</div>
		</>
	);
};

const NotConnectedWalletVariant = ({
	showWallets,
	setShowWallets,
	handleWalletConnect,
	dropdownRef,
}: {
	showWallets: boolean;
	setShowWallets: (show: boolean) => void;
	handleWalletConnect: (walletName: string) => void;
	dropdownRef: React.RefObject<HTMLDivElement>;
}) => {
	const wallets = useWallets();
	return (
		<div className="relative" ref={dropdownRef}>
			<Button
				variant="default"
				size="sm"
				onClick={() => setShowWallets(!showWallets)}
				className="flex items-center gap-2"
			>
				<Wallet className="w-4 h-4" />
				Connect Wallet
				<ChevronDown className="w-3 h-3" />
			</Button>

			{showWallets && (
				<div className="absolute top-full mt-1 right-0 bg-white border rounded-lg shadow-lg py-2 min-w-48 z-50">
					<div className="px-3 pb-2 border-b">
						<p className="text-sm font-medium">
							Choose Wallet
						</p>
					</div>
					{wallets.map((wallet) => (
						<button
							key={wallet.name}
							onClick={() =>
								handleWalletConnect(wallet.name)
							}
							className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 w-full text-left"
						>
							<img
								src={wallet.icon}
								alt={wallet.name}
								className="w-5 h-5 rounded"
							/>
							{wallet.name}
						</button>
					))}
					{wallets.length === 0 && (
						<div className="px-3 py-3 text-center">
							<AlertTriangle className="w-6 h-6 text-muted-foreground mx-auto mb-3" />
							<p className="text-sm text-muted-foreground">
								No wallets found.
								<br /> Install a wallet (e.g. Slush Wallet)
								to continue.
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

// Helper component for account switching section
const AccountSwitchingSection = ({
	showTitle = true,
	handleSwitchAccount,
	handleSignAndConnect,
	isConnecting,
}: {
	showTitle?: boolean;
	handleSwitchAccount: (account: WalletAccount) => void;
	handleSignAndConnect: () => void;
	isConnecting: boolean;
}) => {
	const accounts = useAccounts();
	const currentAccount = useCurrentAccount();

	const { authenticatedAddresses } = useApiAuth();

	return (
		<>
			{showTitle && (
				<div className="px-3 pb-2 border-b">
					<p className="text-sm font-medium">
						Switch Account
					</p>
				</div>
			)}
			{accounts.map((account) => (
				<AccountItem
					key={account.address}
					account={account}
					currentAccount={currentAccount}
					authenticatedAddresses={authenticatedAddresses}
					onSwitchAccount={handleSwitchAccount}
					onSignAndConnect={handleSignAndConnect}
					isConnecting={isConnecting}
				/>
			))}
			{showTitle && <Divider />}
		</>
	);
};
