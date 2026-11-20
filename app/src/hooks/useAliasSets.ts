// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
	useQuery,
	type QueryClient,
} from '@tanstack/react-query';

import { useNetwork } from '../contexts/NetworkContext';
import {
	readAliasSets,
	readChainIdentifier,
	type AliasRead,
} from '../lib/alias-set';
import { type SuiNetwork } from '../lib/network';
import { type NodeFacts } from '../lib/proposal-integrity';
import { QueryKeys } from '../lib/queryKeys';

const ALIAS_SETS_STALE_TIME_MS = 30_000;

/** The alias sets of `pods` on `network`, one batched read for the whole list. */
export function aliasSetsQuery(
	client: ClientWithCoreApi,
	network: SuiNetwork,
	pods: readonly string[],
) {
	const sorted = [
		...new Set(pods.map((pod) => normalizeSuiAddress(pod))),
	].sort();
	return {
		queryKey: [QueryKeys.AliasSets, network, sorted],
		queryFn: () => readAliasSets(client, sorted),
		staleTime: ALIAS_SETS_STALE_TIME_MS,
		retry: false,
	};
}

/** The chain identifier of `network`'s node; a failed (null) read is never fresh. */
export function chainIdentifierQuery(
	client: ClientWithCoreApi,
	network: SuiNetwork,
) {
	return {
		queryKey: [QueryKeys.ChainIdentifier, network],
		queryFn: () => readChainIdentifier(client),
		staleTime: (query: {
			state: { data: string | null | undefined };
		}) => (query.state.data ? Infinity : 0),
		retry: false,
	};
}

/** Each pod's alias read on `network` (the selected one by default), undefined until the first read lands. */
export function useAliasSets(
	pods: readonly string[],
	{
		network: requested,
		enabled = true,
	}: { network?: SuiNetwork; enabled?: boolean } = {},
) {
	const dappKit = useDAppKit();
	const { network: selected } = useNetwork();
	const network = requested ?? selected;
	const { data, isFetching, refetch } = useQuery({
		...aliasSetsQuery(
			dappKit.getClient(network),
			network,
			pods,
		),
		enabled: enabled && pods.length > 0,
	});
	return {
		aliases: data,
		fetching: isFetching,
		retry: () => void refetch(),
	};
}

/** The pod's alias set, read now, and the node's chain, for a sign or propose decision. Never throws. */
export async function readNodeFacts(
	queryClient: QueryClient,
	client: ClientWithCoreApi,
	network: SuiNetwork,
	pod: string,
): Promise<NodeFacts> {
	const [aliases, chain] = await Promise.all([
		queryClient
			.fetchQuery({
				...aliasSetsQuery(client, network, [pod]),
				staleTime: 0,
			})
			.then(
				(reads): AliasRead =>
					reads.get(normalizeSuiAddress(pod)) ?? {
						kind: 'failed',
					},
			)
			.catch((): AliasRead => ({ kind: 'failed' })),
		queryClient
			.fetchQuery(chainIdentifierQuery(client, network))
			.catch(() => null),
	]);
	return { aliases, chain };
}
