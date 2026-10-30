// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useWalletConnection } from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';

import { content } from '@/content';
import {
	walletSupportsNetwork,
	type SuiNetwork,
} from '@/contexts/NetworkContext';
import { API_BASE_URL } from '@/lib/api';
import { QueryKeys } from '@/lib/queryKeys';

export interface NetworkOption {
	value: SuiNetwork;
	/** False when picking it would drop the wallet connection. */
	enabled: boolean;
	/** Why it is disabled, for the menu. */
	hint?: string;
}

/**
 * Who is asking. The app (accounts, proposals) only works on networks the
 * API serves and never on devnet. The developer tools talk to the chain
 * directly, so they can use any network the build knows, devnet included.
 */
export type NetworkScope = 'app' | 'tools';

// The order every picker shows them in.
const ORDER: SuiNetwork[] = [
	'mainnet',
	'testnet',
	'devnet',
	'localnet',
];
// Until the API has answered, or if it never does.
const FALLBACK: SuiNetwork[] = ['mainnet', 'testnet'];

/**
 * The networks a picker offers for its scope (localnet only when this
 * build has an RPC URL for it, and in the app only when the API serves
 * it too), each flagged by whether the connected
 * wallet can sign on it. dapp-kit drops the account when the current
 * network is one the wallet does not advertise, so those stay disabled.
 */
export function useNetworkOptions(
	scope: NetworkScope = 'app',
): NetworkOption[] {
	const { wallet } = useWalletConnection();
	const { data } = useQuery({
		queryKey: [QueryKeys.ApiHealth],
		queryFn: async () => {
			const response = await fetch(
				`${API_BASE_URL}/health`,
			);
			if (!response.ok)
				throw new Error(
					`Health check failed: ${response.status}`,
				);
			return (await response.json()) as {
				networks?: string[];
			};
		},
		staleTime: Infinity,
		retry: 1,
	});
	const served = data?.networks ?? FALLBACK;
	const offered = (network: SuiNetwork) => {
		if (
			network === 'localnet' &&
			!import.meta.env.VITE_LOCALNET_RPC_URL
		)
			return false;
		if (scope === 'tools') return true;
		return network !== 'devnet' && served.includes(network);
	};

	return ORDER.filter(offered).map((value) => {
		const enabled = walletSupportsNetwork(wallet, value);
		return enabled
			? { value, enabled }
			: {
					value,
					enabled,
					hint: content.network.notInWallet(wallet?.name),
				};
	});
}

/**
 * One network's option from `useNetworkOptions`, or a disabled stand-in
 * with a hint when the picker does not offer that network at all.
 */
export function useNetworkOption(
	network: SuiNetwork,
	scope: NetworkScope = 'app',
): NetworkOption {
	return (
		useNetworkOptions(scope).find(
			(option) => option.value === network,
		) ?? {
			value: network,
			enabled: false,
			hint: content.network.notAvailable,
		}
	);
}
