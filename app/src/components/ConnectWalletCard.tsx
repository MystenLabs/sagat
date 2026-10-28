// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useCurrentWallet,
	useWallets,
} from '@mysten/dapp-kit-react';
import { formatAddress } from '@mysten/sui/utils';
import { TriangleAlert, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { WalletPicker } from '@/components/WalletPicker';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useSignInPolicy } from '@/hooks/useSignInPolicy';
import {
	declinedMessage,
	UNNAMED_WALLET,
} from '@/lib/wallet-session';

/**
 * The signed-out page: connect a wallet, or, with one connected, sign the
 * message that proves the address. Connecting goes straight on to the
 * signature, so the second state is mostly what a restored session with an
 * expired cookie, or a switched account, sees. On pages that only need a
 * wallet, picking one just connects it: the picker and Try again read the
 * route's policy themselves.
 */
export function ConnectWalletCard() {
	const currentAccount = useCurrentAccount();
	const currentWallet = useCurrentWallet();
	const wallets = useWallets();
	const {
		declined,
		connectWallet,
		signAndConnect,
		isConnecting,
		isAuthCheckFailing,
	} = useApiAuth();
	const signIn = useSignInPolicy();
	// Gone when the wallet was uninstalled since: then only the picker.
	const declinedWallet =
		declined &&
		wallets.find((w) => w.name === declined.wallet);

	const note = declined && (
		<p
			role="alert"
			className="flex items-center justify-center gap-1.5 text-13 text-error-foreground"
			data-testid="connect-declined"
			data-wallet={declined.wallet}
		>
			<TriangleAlert className="size-3.5 shrink-0" />
			{declinedMessage(declined.wallet)}
		</p>
	);

	return (
		<div className="page-shell flex-1 justify-center">
			{currentAccount ? (
				<EmptyState
					testId="auth-prompt"
					icon={Wallet}
					title="Sign in to continue"
					description={`Sign a message in ${currentWallet?.name ?? UNNAMED_WALLET} to prove you own ${formatAddress(currentAccount.address)}. No transaction is sent.`}
					note={note}
					action={
						<Button
							onClick={() => signAndConnect()}
							disabled={isConnecting || isAuthCheckFailing}
							data-testid="sign-in-button"
						>
							{isConnecting ? 'Signing in…' : 'Sign in'}
						</Button>
					}
				/>
			) : (
				<EmptyState
					testId="connect-wallet-prompt"
					icon={Wallet}
					title="Connect a wallet to get started"
					description="Connect your wallet to see your accounts, proposals and invitations."
					note={note}
					action={
						declinedWallet ? (
							<>
								<Button
									// This route's policy, not the declined pick's.
									onClick={() =>
										void connectWallet(declinedWallet, {
											signIn,
										})
									}
									data-testid="connect-retry"
								>
									Try again
								</Button>
								<WalletPicker variant="outline" />
							</>
						) : (
							<WalletPicker />
						)
					}
				/>
			)}
		</div>
	);
}
