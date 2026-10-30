// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useCurrentWallet,
	useWallets,
} from '@mysten/dapp-kit-react';
import { formatAddress } from '@mysten/sui/utils';
import { TriangleAlert, Wallet } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { WalletPicker } from '@/components/WalletPicker';
import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';

/**
 * The signed-out page: connect a wallet, then, with one connected, sign
 * the message that proves the address. Connecting only connects, so Sign
 * in is always its own click, and the retry after a declined signature.
 */
export function ConnectWalletCard() {
	const currentAccount = useCurrentAccount();
	const currentWallet = useCurrentWallet();
	const wallets = useWallets();
	const {
		declined,
		clearDeclined,
		connectWallet,
		signAndConnect,
		isConnecting,
		isAuthCheckFailing,
	} = useApiAuth();
	// The declined line belongs to the card that showed it. A decline
	// that lands while no card is shown is dropped too.
	useEffect(() => {
		clearDeclined();
		return () => clearDeclined();
	}, [clearDeclined]);
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
			{content.signedOut.declined(declined.wallet)}
		</p>
	);

	return (
		<div className="page-shell flex-1 justify-center">
			{currentAccount ? (
				<EmptyState
					testId="auth-prompt"
					icon={Wallet}
					title={content.signedOut.signIn.title}
					description={content.signedOut.signIn.description(
						currentWallet?.name ??
							content.signedOut.unnamedWallet,
						formatAddress(currentAccount.address),
					)}
					note={note}
					action={
						<Button
							onClick={() => signAndConnect()}
							disabled={isConnecting || isAuthCheckFailing}
							data-testid="sign-in-button"
						>
							{isConnecting
								? content.signedOut.signIn.signingIn
								: content.signedOut.signIn.button}
						</Button>
					}
				/>
			) : (
				<EmptyState
					testId="connect-wallet-prompt"
					icon={Wallet}
					title={content.signedOut.connect.title}
					description={
						content.signedOut.connect.description
					}
					note={note}
					action={
						declinedWallet ? (
							<>
								<Button
									onClick={() =>
										void connectWallet(declinedWallet)
									}
									data-testid="connect-retry"
								>
									{content.common.tryAgain}
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
