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

function AccountItem({
	account,
	currentAccount,
	authenticatedAddresses,
	onSwitchAccount,
	onSignAndConnect,
	isConnecting,
}: AccountItemProps) {
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
}

export function CustomWalletButton({
	variant = 'header',
	disableAccountSwitching = false,
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
		authenticatedAddresses,
	} = useApiAuth();
	const { network, setNetwork, isTestMode } = useNetwork();
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

	const handleCopyAddress = () => {
		if (currentAccount?.address) {
			copyAddress(currentAccount.address);
		}
	};

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
				variant={variant}
				showWallets={showWallets}
				setShowWallets={setShowWallets}
				handleWalletConnect={handleWalletConnect}
				dropdownRef={dropdownRef}
			/>
		);
	}

	// Wallet connected but not authenticated
	if (!isCurrentAddressAuthenticated) {
		if (variant === 'sidebar') {
			return (
				<div className="mt-8 p-4 bg-white rounded-lg border border-slate-200">
					<div className="text-center">
						<Shield className="w-6 h-6 text-blue-600 mx-auto mb-3" />
						<h3 className="font-medium text-slate-900 mb-2">
							Authenticate Wallet
						</h3>
						<p className="text-sm text-slate-600 mb-3">
							{formatAddress(currentAccount.address)}
						</p>
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

						{!disableAccountSwitching &&
							accounts.length > 1 && (
								<div className="mb-3">
									<p className="text-xs text-slate-500 mb-2">
										Switch Account
									</p>
									<div className="max-h-24 overflow-y-auto space-y-1">
										{accounts
											.filter(
												(acc) =>
													acc.address !==
													currentAccount.address,
											)
											.map((account) => (
												<div
													key={account.address}
													className="text-xs bg-slate-50 hover:bg-slate-100 rounded border"
												>
													<AccountItem
														account={account}
														currentAccount={currentAccount}
														authenticatedAddresses={
															authenticatedAddresses
														}
														onSwitchAccount={(acc) =>
															switchAccount({
																account: acc,
															})
														}
														onSignAndConnect={
															signAndConnect
														}
														isConnecting={isConnecting}
													/>
												</div>
											))}
									</div>
								</div>
							)}

						<Button
							onClick={handleFullDisconnect}
							variant="ghost"
							size="sm"
							className="w-full text-xs text-slate-500 hover:text-red-600"
						>
							<LogOut className="w-3 h-3 mr-1" />
							Disconnect
						</Button>
					</div>
				</div>
			);
		}

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
					<span
						className={`text-xs px-1.5 py-0.5 rounded ${
							isTestMode
								? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
								: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
						}`}
					>
						{network}
					</span>
					<ChevronDown className="w-3 h-3" />
				</Button>

				{showWallets && (
					<div className="absolute top-full mt-1 right-0 bg-white border rounded-lg shadow-lg py-2 min-w-64 z-50">
						<div className="px-3 py-2 border-b text-center">
							<p className="text-sm font-medium text-blue-700">
								Authentication Required
							</p>
						</div>

						{accounts.length > 1 && (
							<AccountSwitchingSection
								handleSwitchAccount={handleSwitchAccount}
								handleSignAndConnect={signAndConnect}
								isConnecting={isConnecting}
							/>
						)}

						<div className="px-3 py-2">
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
						<button
							onClick={handleFullDisconnect}
							className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 w-full text-left text-red-600"
						>
							<LogOut className="w-4 h-4" />
							Disconnect
						</button>
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
							onClick={handleCopyAddress}
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
				<span
					className={`text-xs px-1.5 py-0.5 rounded ${
						isTestMode
							? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
							: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
					}`}
				>
					{network}
				</span>
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

					<button
						onClick={handleCopyAddress}
						className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 w-full text-left"
					>
						{copied ? (
							<Check className="w-4 h-4" />
						) : (
							<Copy className="w-4 h-4" />
						)}
						{copied ? 'Copied!' : 'Copy Address'}
					</button>
					<div className="border-t my-1"></div>
					<div className="flex items-center justify-between px-3 py-2 text-sm">
						<div className="flex items-center gap-2">
							<Globe className="w-4 h-4" />
							<span>Test Mode</span>
						</div>
						<Switch
							checked={isTestMode}
							onCheckedChange={(checked) =>
								setNetwork(checked ? 'testnet' : 'mainnet')
							}
							className="scale-75"
						/>
					</div>
					<div className="border-t my-1"></div>
					<button
						onClick={handleFullDisconnect}
						className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 w-full text-left text-red-600"
					>
						<LogOut className="w-4 h-4" />
						Disconnect
					</button>
				</div>
			)}
		</div>
	);
}

const NotConnectedWalletVariant = ({
	variant,
	showWallets,
	setShowWallets,
	handleWalletConnect,
	dropdownRef,
}: {
	variant: WalletVariant;
	showWallets: boolean;
	setShowWallets: (show: boolean) => void;
	handleWalletConnect: (walletName: string) => void;
	dropdownRef: React.RefObject<HTMLDivElement>;
}) => {
	const wallets = useWallets();

	if (variant === 'sidebar') {
		return (
			<div className="mt-8 p-4 bg-white rounded-lg border border-slate-200">
				<div className="text-center">
					<Wallet className="w-6 h-6 text-slate-600 mx-auto mb-3" />
					<h3 className="font-medium text-slate-900 mb-2">
						Connect Wallet
					</h3>
					<p className="text-sm text-slate-600 mb-4">
						Connect your wallet to create a multisig
					</p>

					<div className="relative">
						<Button
							onClick={() => setShowWallets(!showWallets)}
							size="sm"
							className="w-full"
						>
							<Wallet className="w-4 h-4 mr-2" />
							Choose Wallet
						</Button>

						{showWallets && (
							<div className="absolute top-full mt-2 left-0 right-0 bg-white border rounded-lg shadow-lg py-2 z-50">
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
							</div>
						)}
					</div>
				</div>
			</div>
		);
	}

	// Header variant
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
					<div className="px-3 py-2 border-b">
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
				<div className="px-3 py-2 border-b">
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
			{showTitle && <div className="border-t my-1"></div>}
		</>
	);
};
