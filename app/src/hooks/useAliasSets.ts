// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
	useIsFetching,
	useQuery,
	useQueryClient,
	type QueryClient,
} from '@tanstack/react-query';

import { useNetwork } from '../contexts/NetworkContext';
import {
	readAliasSets,
	readChainIdentifier,
	withPodRead,
	type AliasRead,
} from '../lib/alias-set';
import { CONFIG } from '../lib/constants';
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
	const { data } = useQuery({
		...aliasSetsQuery(
			dappKit.getClient(network),
			network,
			pods,
		),
		enabled: enabled && pods.length > 0,
		// Read again while shown; rows keep their state during the refetch.
		refetchInterval: CONFIG.REFETCH_INTERVAL,
		// Pods already read keep their state while the list changes.
		placeholderData: (previous, previousQuery) =>
			previousQuery?.queryKey[1] === network
				? previous
				: undefined,
	});
	return { aliases: data };
}

/** Reads every shown alias set again, and every chain identifier that failed; `retrying` while any of them is in flight. */
export function useRetryNodeReads() {
	const queryClient = useQueryClient();
	const retrying =
		useIsFetching({ queryKey: [QueryKeys.AliasSets] }) +
			useIsFetching({
				queryKey: [QueryKeys.ChainIdentifier],
			}) >
		0;
	const retry = () => {
		void queryClient.refetchQueries({
			queryKey: [QueryKeys.AliasSets],
			type: 'active',
		});
		void queryClient.refetchQueries({
			queryKey: [QueryKeys.ChainIdentifier],
			type: 'active',
			predicate: (query) => !query.state.data,
		});
	};
	return { retry, retrying };
}

/** Writes a fresh read of `pod` into every cached alias read on `network` that holds it. */
function spreadPodRead(
	queryClient: QueryClient,
	network: SuiNetwork,
	pod: string,
	read: AliasRead,
) {
	queryClient.setQueriesData<Map<string, AliasRead>>(
		{
			queryKey: [QueryKeys.AliasSets, network],
			predicate: (query) =>
				query.state.data instanceof Map &&
				query.state.data.has(pod),
		},
		(cached) => cached && withPodRead(cached, pod, read),
	);
}

/** One pod's alias set on `network`, never cached as fresh; each read reaches every list that holds the pod. */
function podAliasSetQuery(
	queryClient: QueryClient,
	client: ClientWithCoreApi,
	network: SuiNetwork,
	pod: string,
) {
	const normalized = normalizeSuiAddress(pod);
	return {
		queryKey: [
			QueryKeys.AliasSets,
			network,
			'pod',
			normalized,
		],
		queryFn: async (): Promise<AliasRead> => {
			const read: AliasRead = (
				await readAliasSets(client, [normalized])
			).get(normalized) ?? { kind: 'failed' };
			spreadPodRead(queryClient, network, normalized, read);
			return read;
		},
		staleTime: 0,
		retry: false,
	};
}

/** The pod's alias set, read now. Never throws. */
export function readPodAliasSet(
	queryClient: QueryClient,
	client: ClientWithCoreApi,
	network: SuiNetwork,
	pod: string,
): Promise<AliasRead> {
	return queryClient
		.fetchQuery(
			podAliasSetQuery(queryClient, client, network, pod),
		)
		.catch((): AliasRead => ({ kind: 'failed' }));
}

/** The pod's alias set on the selected network, read again on mount; undefined until that read lands. */
export function useFreshPodAliasSet(
	pod: string,
	{ enabled = true }: { enabled?: boolean } = {},
): AliasRead | undefined {
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const { network } = useNetwork();
	const { data, isFetchedAfterMount } = useQuery({
		...podAliasSetQuery(
			queryClient,
			dappKit.getClient(network),
			network,
			pod,
		),
		enabled,
		refetchOnMount: 'always',
	});
	return isFetchedAfterMount ? data : undefined;
}

/** The pod's alias set, read now, and the node's chain, for a sign or propose decision. Never throws. */
export async function readNodeFacts(
	queryClient: QueryClient,
	client: ClientWithCoreApi,
	network: SuiNetwork,
	pod: string,
): Promise<NodeFacts> {
	const [aliases, chain] = await Promise.all([
		readPodAliasSet(queryClient, client, network, pod),
		queryClient
			.fetchQuery(chainIdentifierQuery(client, network))
			.catch(() => null),
	]);
	return { aliases, chain };
}
