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
	// `keepWallet` keeps the wallet connected when the user declines,
	// for routes where signing in is optional.
	signAndConnect: (options?: SignInOptions) => void;
	// From a wallet pick, or a Sign in click, until the sign-in settles.
	isConnecting: boolean;

	// The wallet turned the last connect or signature request down.
	declined: Declined | null;
	// Connects the wallet, then (unless `signIn` is false) asks for the
	// sign-in signature.
	connectWallet: (
		wallet: UiWallet,
		options?: ConnectOptions,
	) => Promise<void>;
	// Signs out of the API, then disconnects the wallet.
	disconnectWallet: () => Promise<void>;
}

interface SignInOptions {
	keepWallet?: boolean;
}

interface ConnectOptions {
	// False on pages that only need a wallet, not an API session.
	signIn?: boolean;
}

interface Declined {
	wallet: string;
}

const ApiAuthContext = createContext<
	ApiAuthContextType | undefined
>(undefined);

const AUTH_QUERY_KEY = ['auth', 'check'] as const;

const SIGNED_OUT_MID_SIGN_IN =
	'Signed out while signing in';

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

	// Bumped by every logout, so a sign-in that started before it can tell
	// its answer came too late.
	const sessionGeneration = useRef(0);

	// Connect mutation - signs message and sends to API
	const connectMutation = useMutation({
		// The variable only steers onError; the sign-in ignores it.
		mutationFn: async (_options?: SignInOptions) => {
			// The kit's store, not the render's: right after a connect or an
			// account switch the render hasn't caught up yet.
			const { account, wallet } =
				dappKit.stores.$connection.get();
			if (!account) throw new Error('No wallet connected');
			// Rejecting here (not returning) lets onError toast it.
			if (
				queryClient.getQueryState(AUTH_QUERY_KEY)
					?.status === 'error'
			)
				throw new Error("Can't reach the service");
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
				throw new WalletDeclinedError(
					wallet?.name ?? UNNAMED_WALLET,
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
				// The user logged out meanwhile, but this answer has just set a
				// session cookie: it must not outlive the logout.
				await apiClient.disconnect().catch(() => {});
				await refetchAuth();
				throw new Error(SIGNED_OUT_MID_SIGN_IN);
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
		onError: async (
			error: Error,
			options?: SignInOptions,
		) => {
			// The logout already said so; a failure toast would contradict it.
			if (error.message === SIGNED_OUT_MID_SIGN_IN) return;
			if (!(error instanceof WalletDeclinedError)) {
				toast.error(
					`Authentication failed: ${error.message}`,
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
			setDeclined({ wallet: error.wallet });
			const signedIn =
				queryClient.getQueryData<AuthCheckResponse>(
					AUTH_QUERY_KEY,
				)?.addresses ?? [];
			if (signedIn.length === 0 && !options?.keepWallet) {
				// Nobody is signed in: back to the connect card, with no
				// wallet session saved (the kit clears its storage entry).
				await dappKit.disconnectWallet().catch(() => {});
			} else {
				// Another account is still signed in, or the sign-in was
				// optional on this route, so the wallet stays.
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
	// Covers the whole pick, so the card reads "Signing in…" until the
	// answer, not just while the signature is out.
	const [connecting, setConnecting] = useState(false);

	const connectWallet = async (
		wallet: UiWallet,
		{ signIn = true }: ConnectOptions = {},
	) => {
		if (connectInFlight.current) return;
		connectInFlight.current = true;
		setConnecting(true);
		setDeclined(null);
		const generation = sessionGeneration.current;
		try {
			try {
				await dappKit.connectWallet({ wallet });
			} catch {
				setDeclined({ wallet: wallet.name });
				return;
			}
			if (!signIn) return;
			const { data, isError } = await refetchAuth();
			// Logged out while the check ran.
			if (sessionGeneration.current !== generation) return;
			// Can't tell whether the user is signed in: the unreachable state
			// shows instead of a signature that would only fail.
			if (isError || !data) return;
			const address =
				dappKit.stores.$connection.get().account?.address;
			// The session cookie still covers this address.
			if (data.addresses.some((x) => x.address === address))
				return;
			// onError handles the failures.
			await connectMutation.mutateAsync().catch(() => {});
		} finally {
			connectInFlight.current = false;
			setConnecting(false);
		}
	};

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
		signAndConnect: (options) =>
			connectMutation.mutate(options),
		isConnecting: connectMutation.isPending || connecting,

		declined,
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
