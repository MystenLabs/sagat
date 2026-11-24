// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	getWalletUniqueIdentifier,
	type UiWallet,
} from '@mysten/dapp-kit-core';
import { registerWalletConnectWallet } from '@mysten/walletconnect-wallet';

import { content } from '../content';
import { newClient } from './sui-client';

// Undefined without indexedDB or when one was already registered.
export const walletConnect = (
	typeof indexedDB === 'undefined'
		? undefined
		: registerWalletConnectWallet({
				projectId: '26cfd1ea871281c3665d0dad8b8cebd7',
				getClient: (chain) => {
					return newClient(chain);
				},
				metadata: {
					walletName: 'Wallet Connect',
					icon: 'https://walletconnect.org/walletconnect-logo.png',
					enabled: true,
					id: 'walletconnect',
				},
				dAppMetadata: {
					name: content.common.appName,
					description: content.common.appDescription,
					url: window.location.origin,
					icons: [
						`${window.location.origin}/apple-touch-icon.png`,
					],
				},
			})
)?.wallet;

export const isWalletConnect = (wallet: UiWallet) =>
	!!walletConnect &&
	getWalletUniqueIdentifier(wallet) === walletConnect.id;
