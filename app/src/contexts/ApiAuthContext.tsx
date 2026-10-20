// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
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
} from 'react';

import { toast } from '@/lib/toast';

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
	disconnect: () => Promise<void>;
	isConnecting: boolean;
	isDisconnecting: boolean;
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

	// Connect mutation - signs message and sends to API
	const connectMutation = useMutation({
		mutationFn: async () => {
			if (!currentAccount)
				throw new Error('No wallet connected');
			// Rejecting here (not returning) lets onError toast it.
			if (isAuthCheckFailing)
				throw new Error("Can't reach the service");
			const expiry = defaultExpiry();

			// Sign with current account
			const signResult = await dappKit.signPersonalMessage({
				message: new TextEncoder().encode(
					PersonalMessages.connect(expiry),
				),
			});

			// Send to API
			return apiClient.connect(
				signResult.signature,
				expiry,
			);
		},
		onSuccess: async () => {
			await refetchAuth();
			await queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			await queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			toast.success('Successfully authenticated');
		},
		onError: (error: Error) => {
			toast.error(
				`Authentication failed: ${error.message}`,
			);
		},
	});

	// Disconnect mutation
	const disconnectMutation = useMutation({
		mutationFn: () => apiClient.disconnect(),
		onSuccess: async () => {
			queryClient.clear();
			await refetchAuth();
			toast.success('Disconnected');
		},
		onError: (error: Error) => {
			toast.error(`Disconnect failed: ${error.message}`);
		},
	});

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
		signAndConnect: () => connectMutation.mutate(),
		disconnect: async () => {
			await disconnectMutation.mutateAsync();
		},
		isConnecting: connectMutation.isPending,
		isDisconnecting: disconnectMutation.isPending,
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
