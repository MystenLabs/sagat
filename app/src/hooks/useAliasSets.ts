// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
	useIsFetching,
	useQuery,
	useQueryClient,
	type Query,
	type QueryClient,
	type QueryFilters,
} from '@tanstack/react-query';

import { useNetwork } from '../contexts/NetworkContext';
import {
	readAliasSets,
	readChainIdentifier,
	withPodRead,
	type AliasRead,
} from '../lib/alias-set';
import { type SuiNetwork } from '../lib/network';
import { type NodeFacts } from '../lib/proposal-integrity';
import { QueryKeys } from '../lib/queryKeys';

const ALIAS_SETS_STALE_TIME_MS = 30_000;

/** The key of a batched read of `pods` (normalized, sorted) on `network`. */
export function aliasSetsKey(
	network: SuiNetwork,
	pods: readonly string[],
) {
	return [QueryKeys.AliasSets, network, pods] as const;
}

/** The key of a fresh read of one pod (normalized) on `network`. */
function podAliasSetKey(network: SuiNetwork, pod: string) {
	return [
		QueryKeys.AliasSets,
		network,
		'pod',
		pod,
	] as const;
}

/** The batched reads on `network` whose pod list holds `pod`; never a single-pod read. */
function batchesHolding(
	network: SuiNetwork,
	pod: string,
): QueryFilters {
	return {
		queryKey: [QueryKeys.AliasSets, network],
		predicate: ({ queryKey: [, , pods] }) =>
			Array.isArray(pods) && pods.includes(pod),
	};
}

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
		queryKey: aliasSetsKey(network, sorted),
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
		// Pods already read keep their state while the list changes.
		placeholderData: (previous, previousQuery) =>
			previousQuery?.queryKey[1] === network
				? previous
				: undefined,
	});
	return { aliases: data };
}

export function usePodAliasSet(
	pod: string,
	options: { network?: SuiNetwork; enabled?: boolean } = {},
): AliasRead | undefined {
	const { aliases } = useAliasSets([pod], options);
	return aliases?.get(normalizeSuiAddress(pod));
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

/** Writes a fresh read of `pod` into every batched read on `network` that holds it. */
function spreadPodRead(
	queryClient: QueryClient,
	network: SuiNetwork,
	pod: string,
	read: AliasRead,
) {
	const filters = batchesHolding(network, pod);
	const fetching = new Set<Query>(
		queryClient
			.getQueryCache()
			.findAll(filters)
			.filter(
				(query) => query.state.fetchStatus !== 'idle',
			),
	);
	const wasFetching = {
		predicate: (query: Query) => fetching.has(query),
	};
	// Their older responses are dropped; they read again after the write.
	void queryClient.cancelQueries(wasFetching);
	queryClient.setQueriesData<Map<string, AliasRead>>(
		filters,
		(cached) => cached && withPodRead(cached, pod, read),
	);
	void queryClient.refetchQueries(wasFetching);
}

/** Reads one pod's alias set (normalized) from `client`. */
function podReader(client: ClientWithCoreApi) {
	return async (pod: string): Promise<AliasRead> =>
		(await readAliasSets(client, [pod])).get(pod) ?? {
			kind: 'failed',
		};
}

/** One pod's alias set on `network`, never cached as fresh; each read reaches every list that holds the pod. */
export function podAliasSetQuery(
	queryClient: QueryClient,
	network: SuiNetwork,
	pod: string,
	readPod: (pod: string) => Promise<AliasRead>,
) {
	const normalized = normalizeSuiAddress(pod);
	return {
		queryKey: podAliasSetKey(network, normalized),
		queryFn: async (): Promise<AliasRead> => {
			const read = await readPod(normalized);
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
			podAliasSetQuery(
				queryClient,
				network,
				pod,
				podReader(client),
			),
		)
		.catch((): AliasRead => ({ kind: 'failed' }));
}

/** Reads the pod's alias set on the selected network again on mount, behind what the lists already show. */
export function useRereadPodAliasSet(
	pod: string,
	{ enabled = true }: { enabled?: boolean } = {},
) {
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const { network } = useNetwork();
	// The read lands in the lists through spreadPodRead; its data isn't used here.
	useQuery({
		...podAliasSetQuery(
			queryClient,
			network,
			pod,
			podReader(dappKit.getClient(network)),
		),
		enabled,
		refetchOnMount: 'always',
		notifyOnChangeProps: [],
	});
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
