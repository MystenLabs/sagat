// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
	type UiWallet,
} from '@mysten/dapp-kit-react';
import {
	defaultExpiry,
	PersonalMessages,
	SagatApiError,
	type Address,
	type AuthCheckResponse,
} from '@mysten/sagat';
import {
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import React, {
	createContext,
	useContext,
	useEffect,
	useState,
} from 'react';

import { toast } from '@/lib/toast';
import { errorMessage } from '@/lib/utils';
import {
	declinedMessage,
	UNNAMED_WALLET,
	WalletDeclinedError,
} from '@/lib/wallet-session';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

interface ApiAuthContextType {
	// Auth state from API
	isAuthenticated: boolean;
	authenticatedAddresses: string[];
	isCheckingAuth: boolean;
	// The auth check failed without an answer from the API (network
	// error, timeout, 5xx, or a block in front of it), so we can't tell
	// whether the user is signed in.
	isApiUnreachable: boolean;
	// The last settled auth check failed, even if an earlier answer still
	// holds. A signature would only fail at the connect call.
	isAuthCheckFailing: boolean;
	isRetryingAuth: boolean;
	retryAuthCheck: () => void;

	// Current wallet account state
	currentAddress: Address | null;
	isCurrentAddressAuthenticated: boolean;

	// Actions
	signAndConnect: () => void;
	// From an explicit connect until the signature settles.
	isConnecting: boolean;

	// The wallet turned the last connect or signature request down.
	declined: { wallet: string } | null;
	// Connects the wallet, then asks for the sign-in signature.
	connectWallet: (wallet: UiWallet) => Promise<void>;
	// Connects the wallet that declined again.
	retryConnect: () => void;
	// Signs out of the API, then disconnects the wallet.
	disconnectWallet: () => Promise<void>;
}

const ApiAuthContext = createContext<
	ApiAuthContextType | undefined
>(undefined);

const AUTH_QUERY_KEY = ['auth', 'check'] as const;

const SIGNED_OUT: AuthCheckResponse = {
	authenticated: false,
	addresses: [],
};

async function checkAuth(): Promise<AuthCheckResponse> {
	try {
		return await apiClient.checkAuth();
	} catch (error) {
		// No (or an expired) session is an answer, not an outage. The API
		// only answers 401 here; a 403 comes from something in front of it.
		if (
			error instanceof SagatApiError &&
			error.status === 401
		) {
			return SIGNED_OUT;
		}
		throw error;
	}
}

export function ApiAuthProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const queryClient = useQueryClient();

	// Get current account from dApp Kit
	const dappKit = useDAppKit();

	const currentAccount = useCurrentAccount();

	// `/auth/check` answers for the session (every address signed in), not
	// one account, so there's one query: an account switch reads the same
	// answer, and a failure holds until a later check succeeds.
	const {
		data: authData,
		isLoading: isCheckingAuth,
		isFetching: isFetchingAuth,
		isError: isAuthCheckFailing,
		refetch: refetchAuth,
	} = useQuery<AuthCheckResponse>({
		queryKey: AUTH_QUERY_KEY,
		queryFn: checkAuth,
		// One quick retry rides out a single 502 during a deploy. An API
		// that refuses or errors still reaches the unreachable state in
		// about a second; one that hangs takes two request timeouts.
		retry: 1,
		retryDelay: 500,
		// Offline is just another way to not reach the API: run the check
		// anyway so it fails, instead of pausing in a state that reads as
		// signed out. This mode turns off the re-check on reconnect, so
		// turn it back on.
		networkMode: 'always',
		refetchOnReconnect: true,
		// Always check when account changes
		enabled: true,
		// refetch on windows focus to make sure we sync across tabs.
		refetchOnWindowFocus: true,
	});

	// Re-check auth when wallet account changes
	useEffect(() => {
		refetchAuth();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentAccount?.address]);

	const [declined, setDeclined] = useState<{
		wallet: string;
	} | null>(null);
	// Set by an explicit connect, so the signature follows it. The kit's
	// silent reconnect on load never sets it.
	const [signAfterConnect, setSignAfterConnect] =
		useState(false);

	// Connect mutation - signs message and sends to API
	const connectMutation = useMutation({
		mutationFn: async () => {
			if (!currentAccount)
				throw new Error('No wallet connected');
			// Rejecting here (not returning) lets onError toast it.
			if (isAuthCheckFailing)
				throw new Error("Can't reach the service");
			const expiry = defaultExpiry();

			// Sign with current account. Any failure here is the wallet's:
			// the user declined, or the wallet refused.
			let signResult;
			try {
				signResult = await dappKit.signPersonalMessage({
					message: new TextEncoder().encode(
						PersonalMessages.connect(expiry),
					),
				});
			} catch (error) {
				throw new WalletDeclinedError(
					dappKit.stores.$connection.get().wallet?.name ??
						UNNAMED_WALLET,
					error,
				);
			}

			// Send to API
			return apiClient.connect(
				signResult.signature,
				expiry,
			);
		},
		onMutate: () => setDeclined(null),
		onSuccess: async () => {
			await refetchAuth();
			await queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			await queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
		},
		onError: async (error: Error) => {
			if (!(error instanceof WalletDeclinedError)) {
				toast.error(
					`Authentication failed: ${error.message}`,
				);
				return;
			}
			setDeclined({ wallet: error.wallet });
			const signedIn =
				queryClient.getQueryData<AuthCheckResponse>(
					AUTH_QUERY_KEY,
				)?.addresses ?? [];
			if (signedIn.length === 0) {
				// Nobody is signed in: back to the connect card, with no
				// wallet session saved (the kit clears its storage entry).
				await dappKit.disconnectWallet().catch(() => {});
			} else {
				// Another account is still signed in, so keep the wallet.
				toast.error(declinedMessage(error.wallet));
			}
		},
	});

	// Disconnect mutation
	const disconnectMutation = useMutation({
		mutationFn: () => apiClient.disconnect(),
		onSuccess: async () => {
			queryClient.clear();
			await refetchAuth();
		},
		onError: (error: Error) => {
			toast.error(`Disconnect failed: ${error.message}`);
		},
	});

	const connectWallet = async (wallet: UiWallet) => {
		setDeclined(null);
		setSignAfterConnect(false);
		try {
			await dappKit.connectWallet({ wallet });
		} catch {
			setDeclined({ wallet: wallet.name });
			return;
		}
		setSignAfterConnect(true);
	};

	const retryConnect = () => {
		const name = declined?.wallet;
		if (!name) return;
		const wallet = dappKit.stores.$wallets
			.get()
			.find((w) => w.name === name);
		if (!wallet) {
			setDeclined(null);
			return;
		}
		void connectWallet(wallet);
	};

	const disconnectWallet = async () => {
		// Sign out of the API first; the wallet disconnects even if that
		// fails (the mutation toasts the failure).
		let signedOut = true;
		try {
			await disconnectMutation.mutateAsync();
		} catch {
			signedOut = false;
		}
		try {
			await dappKit.disconnectWallet();
		} catch (error) {
			// Menu items call this without awaiting, so report it here.
			toast.error(
				`Disconnect failed: ${errorMessage(error, 'the wallet refused')}`,
			);
			return;
		} finally {
			setDeclined(null);
			setSignAfterConnect(false);
		}
		// Only when both steps worked, so it never sits beside a failure.
		if (signedOut) toast.success('Wallet disconnected');
	};

	const currentAddress =
		authData?.addresses?.find(
			(x) => x.address === currentAccount?.address,
		) || null;

	const isCurrentAddressAuthenticated =
		!!currentAddress &&
		(authData?.addresses?.some(
			(x) => x.address === currentAddress.address,
		) ??
			false);

	// A failed refetch keeps the last answer, so a blip on refocus doesn't
	// sign anyone out. Without a session for this address, a failed check
	// means we can't tell, and asking for a signature would only fail.
	const isApiUnreachable =
		isAuthCheckFailing && !isCurrentAddressAuthenticated;

	// After an explicit connect, ask for the signature once the session's
	// answer is in. The handler can't do it: its `currentAccount` is stale
	// right after the connect resolves.
	const { mutate: signIn } = connectMutation;
	useEffect(() => {
		if (!signAfterConnect || !currentAccount) return;
		// The account change has just started a re-check: wait for it.
		if (
			isCheckingAuth ||
			isFetchingAuth ||
			queryClient.isFetching({ queryKey: AUTH_QUERY_KEY }) >
				0
		)
			return;
		setSignAfterConnect(false);
		// Can't tell whether the user is signed in; the unreachable state
		// shows instead of a signature that would only fail.
		if (isAuthCheckFailing) return;
		// The session cookie still covers this address.
		if (isCurrentAddressAuthenticated) return;
		signIn();
	}, [
		signAfterConnect,
		currentAccount,
		isCheckingAuth,
		isFetchingAuth,
		isAuthCheckFailing,
		isCurrentAddressAuthenticated,
		queryClient,
		signIn,
	]);

	const value: ApiAuthContextType = {
		// Auth state
		isAuthenticated: authData?.authenticated ?? false,
		authenticatedAddresses:
			authData?.addresses?.map((x) => x.address) ?? [],
		isCheckingAuth,
		isApiUnreachable,
		isAuthCheckFailing,
		isRetryingAuth: isFetchingAuth,
		retryAuthCheck: () => {
			void refetchAuth();
		},

		// Current wallet
		currentAddress,
		isCurrentAddressAuthenticated,

		// Actions
		// `mutate` leaves failures to onError, so callers needn't catch.
		signAndConnect: () => connectMutation.mutate(),
		// The effect clears `signAfterConnect` as it calls `signIn()`, so
		// there's no gap for a second click to start another signature.
		isConnecting:
			connectMutation.isPending || signAfterConnect,

		declined,
		connectWallet,
		retryConnect,
		disconnectWallet,
	};

	return (
		<ApiAuthContext.Provider value={value}>
			{children}
		</ApiAuthContext.Provider>
	);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApiAuth() {
	const context = useContext(ApiAuthContext);
	if (!context) {
		throw new Error(
			'useApiAuth must be used within ApiAuthProvider',
		);
	}
	return context;
}
