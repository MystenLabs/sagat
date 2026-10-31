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
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from 'react';

import { content } from '@/content';
import { toast } from '@/lib/toast';
import {
	SignInCancelledError,
	WalletDeclinedError,
} from '@/lib/wallet-session';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

const TOASTS = content.toasts;
const COPY = content.signedOut;

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
	// Asks the connected wallet for the sign-in signature.
	signAndConnect: (options?: SignInOptions) => void;
	// From a wallet pick, or a Sign in click, until it settles.
	isConnecting: boolean;

	// The wallet turned the last connect or signature request down.
	declined: Declined | null;
	clearDeclined: () => void;
	// Connects the wallet only; signing in is a separate click.
	connectWallet: (
		wallet: UiWallet,
		options?: ConnectOptions,
	) => Promise<void>;
	// Signs out of the API, then disconnects the wallet.
	disconnectWallet: () => Promise<void>;
}

interface SignInOptions {
	// Where a declined signature shows: only full routes have a
	// connect card, so the wallet menu asks for a toast elsewhere.
	notice?: 'card' | 'toast';
}

interface ConnectOptions {
	// Where a declined connect shows: a public page has no connect
	// card, so the sidebar's picker asks for a toast there.
	notice?: 'card' | 'toast';
}

interface Declined {
	wallet: string;
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
	// card after a declined connect, which leaves no account.
	useEffect(() => {
		refetchAuth();
		if (currentAccount) setDeclined(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentAccount?.address]);

	// Bumped by every logout and by a disconnect from the wallet's side,
	// so a sign-in that started before either can tell its answer came
	// too late.
	const sessionGeneration = useRef(0);

	// A disconnect from the wallet's side drops a sign-in still in
	// flight, as a logout does (a cookie its answer sets is cleared), but
	// doesn't otherwise sign out of the API. A switch between accounts
	// does not: a late answer for another account is still checked by
	// address in onError.
	useEffect(
		() =>
			dappKit.stores.$connection.listen((next, prev) => {
				if (prev?.account && !next.account)
					sessionGeneration.current++;
			}),
		[dappKit],
	);

	// Connect mutation - signs message and sends to API
	const connectMutation = useMutation({
		// The variable only steers onError; the sign-in ignores it.
		mutationFn: async (_options?: SignInOptions) => {
			// The kit's store, not the render's: right after a connect or an
			// account switch the render hasn't caught up yet.
			const { account, wallet } =
				dappKit.stores.$connection.get();
			if (!account)
				throw new Error(content.errors.noWalletConnected);
			// Rejecting here (not returning) lets onError toast it.
			if (
				queryClient.getQueryState(AUTH_QUERY_KEY)
					?.status === 'error'
			)
				throw new Error(content.errors.serviceUnreachable);
			const generation = sessionGeneration.current;
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
				// A rejection that lands after a logout must not touch
				// whatever is connected now.
				if (sessionGeneration.current !== generation)
					throw new SignInCancelledError();
				throw new WalletDeclinedError(
					wallet?.name ?? COPY.unnamedWallet,
					account.address,
					error,
				);
			}

			// Send to API
			const result = await apiClient.connect(
				signResult.signature,
				expiry,
			);
			if (sessionGeneration.current !== generation) {
				// The session ended meanwhile (a logout, or a disconnect in
				// the wallet), but this answer has just set a session cookie:
				// it must not outlive that. Only a failed sign-out is
				// reported: the app already shows the wallet signed out.
				try {
					await apiClient.disconnect();
				} catch {
					toast.error(TOASTS.lateSignInKeptSession);
				}
				await refetchAuth();
				throw new SignInCancelledError();
			}
			return result;
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
		onError: (error: Error, options?: SignInOptions) => {
			// The session ended (a logout, or a disconnect in the wallet) and
			// the app already shows signed out; a failure toast would contradict it.
			if (error instanceof SignInCancelledError) return;
			if (!(error instanceof WalletDeclinedError)) {
				toast.error(
					TOASTS.authenticationFailed(error.message),
				);
				return;
			}
			// A late answer to an earlier wallet or account must not touch
			// the one connected now.
			if (
				dappKit.stores.$connection.get().account
					?.address !== error.address
			)
				return;
			// The wallet stays connected, so Sign in is the retry.
			if (options?.notice === 'toast')
				toast.error(COPY.declined(error.wallet));
			else setDeclined({ wallet: error.wallet });
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
			toast.error(TOASTS.disconnectFailed(error.message));
		},
	});

	// One connect at a time: a second pick while the wallet's prompt is
	// open would race the first for the connection. A sign-in started
	// from the menu or the card holds it too, so a reconnect can't start
	// while a signature is out and its late answer can't undo a newer
	// session.
	const connectInFlight = useRef(false);
	// Covers every connect and sign-in, so the card reads "Signing in…"
	// until the answer, not just while the signature is out.
	const [connecting, setConnecting] = useState(false);

	const withConnectLock = async (
		run: () => Promise<unknown>,
	) => {
		if (connectInFlight.current) return;
		connectInFlight.current = true;
		setConnecting(true);
		try {
			await run();
		} finally {
			connectInFlight.current = false;
			setConnecting(false);
		}
	};

	const connectWallet = (
		wallet: UiWallet,
		{ notice = 'card' }: ConnectOptions = {},
	) =>
		withConnectLock(async () => {
			setDeclined(null);
			try {
				await dappKit.connectWallet({ wallet });
			} catch {
				if (notice === 'toast')
					toast.error(COPY.declined(wallet.name));
				else setDeclined({ wallet: wallet.name });
			}
		});

	const runSignIn = (options?: SignInOptions) =>
		withConnectLock(() =>
			// onError handles the failures.
			connectMutation.mutateAsync(options).catch(() => {}),
		);

	const disconnectWallet = async () => {
		// First, so a sign-in already in flight knows it lost.
		sessionGeneration.current++;
		setDeclined(null);
		// Sign out of the API first; the wallet disconnects even if that
		// fails (the mutation toasts the failure).
		let signedOut = true;
		try {
			await disconnectMutation.mutateAsync();
		} catch {
			signedOut = false;
		}
		// The kit swallows a wallet's refusal to disconnect and disconnects
		// locally regardless.
		await dappKit.disconnectWallet();
		// Only when the sign-out worked, so it never sits beside a failure.
		if (signedOut) toast.success(TOASTS.walletDisconnected);
	};

	// Stable, so effects can depend on it.
	const clearDeclined = useCallback(
		() => setDeclined(null),
		[],
	);

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
		// Failures go to onError, so callers needn't catch.
		signAndConnect: (options) => void runSignIn(options),
		isConnecting: connecting,

		declined,
		clearDeclined,
		connectWallet,
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
