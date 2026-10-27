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
	useRef,
	useState,
} from 'react';

import { toast } from '@/lib/toast';
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
	declined: Declined | null;
	// Connects the wallet, then (unless `signIn` is false) asks for the
	// sign-in signature.
	connectWallet: (
		wallet: UiWallet,
		options?: ConnectOptions,
	) => Promise<void>;
	// Connects the wallet that declined again, with the same options.
	retryConnect: () => void;
	// Signs out of the API, then disconnects the wallet.
	disconnectWallet: () => Promise<void>;
}

interface ConnectOptions {
	// False on pages that only need a wallet, not an API session.
	signIn?: boolean;
}

interface Declined {
	wallet: string;
	// How the declined connect was asked for, so a retry repeats it.
	signIn: boolean;
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

	const [declined, setDeclined] = useState<Declined | null>(
		null,
	);

	// Re-check auth when wallet account changes. A decline was another
	// account's, so its note goes on a switch, but stays on the connect
	// card when the decline itself disconnected the wallet.
	useEffect(() => {
		refetchAuth();
		if (currentAccount) setDeclined(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentAccount?.address]);

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
			// Logged out while `/auth/connect` was in flight: the wallet is
			// gone, but this response has just set a session cookie. Drop it
			// so the session doesn't outlive the logout. (The kit only has a
			// wallet while connected or reconnecting.)
			if (!dappKit.stores.$connection.get().wallet) {
				await apiClient.disconnect().catch(() => {});
				await refetchAuth();
				return;
			}
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
			// A sign-in only follows a connect, so the retry signs in too.
			setDeclined({ wallet: error.wallet, signIn: true });
			// The user said no: drop a sign-in queued behind this one.
			setSignAfterConnect(false);
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

	// One connect at a time: a second pick while the wallet's prompt is
	// open would race the first for the connection.
	const connectInFlight = useRef(false);

	const connectWallet = async (
		wallet: UiWallet,
		{ signIn = true }: ConnectOptions = {},
	) => {
		if (connectInFlight.current) return;
		connectInFlight.current = true;
		setDeclined(null);
		setSignAfterConnect(false);
		try {
			await dappKit.connectWallet({ wallet });
		} catch {
			setDeclined({ wallet: wallet.name, signIn });
			return;
		} finally {
			connectInFlight.current = false;
		}
		if (signIn) setSignAfterConnect(true);
	};

	const retryConnect = () => {
		if (!declined) return;
		const wallet = dappKit.stores.$wallets
			.get()
			.find((w) => w.name === declined.wallet);
		if (!wallet) {
			setDeclined(null);
			return;
		}
		void connectWallet(wallet, { signIn: declined.signIn });
	};

	const disconnectWallet = async () => {
		// Cancel a queued sign-in first, so nothing asks for a signature
		// while the session goes.
		setSignAfterConnect(false);
		setDeclined(null);
		// Sign out of the API first; the wallet disconnects even if that
		// fails (the mutation toasts the failure).
		let signedOut = true;
		try {
			await disconnectMutation.mutateAsync();
		} catch {
			signedOut = false;
		}
		// The kit never rejects a wallet's refusal to disconnect: it logs
		// it and disconnects locally regardless.
		await dappKit.disconnectWallet();
		// Only when the sign-out worked, so it never sits beside a failure.
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
	const { mutate: signIn, isPending: isSigningIn } =
		connectMutation;
	useEffect(() => {
		if (!signAfterConnect || !currentAccount) return;
		// A signature is already out: keep the flag, so this runs once it
		// settles (and skips if that one signed this address in).
		if (isSigningIn) return;
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
		isSigningIn,
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
