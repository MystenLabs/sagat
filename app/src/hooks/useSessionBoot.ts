// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useWalletConnection,
} from '@mysten/dapp-kit-react';
import { useEffect, useState } from 'react';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { LocalStorageKeys } from '../lib/localStorageKeys';

/**
 * How long to hold the layout for the wallet kit's silent restore. The kit
 * can stay in `reconnecting` for good when the restore throws, so past this
 * point the session counts as signed out and the connect prompt shows.
 */
const RECONNECT_CAP_MS = 3000;

// The kit only flips to `reconnecting` a tick after the first render, once
// it has read its saved session. Read the same key up front so that first
// render holds too.
const hadSavedSession = (() => {
	try {
		return !!localStorage.getItem(
			LocalStorageKeys.WalletSession,
		);
	} catch {
		return false;
	}
})();
let kitStarted = false;

/**
 * Whether the previous session is still being restored: `reconnecting`
 * while the wallet kit reconnects (capped), `checkingAuth` while the
 * session's first API check runs (later checks keep the last answer),
 * `holdWalletControls` while either does. The router and the shell both
 * read this so they hold and release together.
 */
export function useSessionBoot() {
	const currentAccount = useCurrentAccount();
	const { isReconnecting, status } = useWalletConnection();
	const { isCheckingAuth } = useApiAuth();
	const [capped, setCapped] = useState(false);

	const restoring =
		isReconnecting ||
		(hadSavedSession &&
			!kitStarted &&
			status === 'disconnected');

	useEffect(() => {
		if (status !== 'disconnected') kitStarted = true;
	}, [status]);

	useEffect(() => {
		if (!restoring) return;
		const timer = setTimeout(() => {
			kitStarted = true;
			setCapped(true);
		}, RECONNECT_CAP_MS);
		return () => {
			clearTimeout(timer);
			setCapped(false);
		};
	}, [restoring]);

	const reconnecting = restoring && !capped;
	const checkingAuth = !!currentAccount && isCheckingAuth;
	return {
		reconnecting,
		checkingAuth,
		holdWalletControls: reconnecting || checkingAuth,
	};
}
