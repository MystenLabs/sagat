// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	type ProposalWithSignatures,
} from '@mysten/sagat';
import { useMemo } from 'react';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import {
	listsAtCutoff,
	mergeNewestFirst,
	pendingFilter,
} from '../lib/proposalUtils';
import { useEpochInfo } from './useEpochInfo';
import { useGetMultisig } from './useGetMultisig';
import {
	PROPOSALS_PAGE_SIZE,
	usePaginatedProposals,
} from './usePaginatedProposals';

export type ProposalFilter =
	| 'all'
	| 'pending'
	| 'waiting'
	| 'ready'
	| 'executed'
	| 'cancelled'
	| 'expired';

// The status each tab asks the API for. The pending tabs all load the
// pending proposals and split them here; Executed adds failed executions
// from a second query, since the endpoint takes one status.
const API_STATUS: Record<
	ProposalFilter,
	ProposalStatus | undefined
> = {
	all: undefined,
	pending: ProposalStatus.PENDING,
	waiting: ProposalStatus.PENDING,
	ready: ProposalStatus.PENDING,
	expired: ProposalStatus.PENDING,
	executed: ProposalStatus.SUCCESS,
	cancelled: ProposalStatus.CANCELLED,
};

interface UseProposalsQueriesParams {
	multisig: MultisigWithMembersForPublicKey;
	network: string;
	activeFilter: ProposalFilter;
}

export function useProposalsQueries({
	multisig,
	network,
	activeFilter,
}: UseProposalsQueriesParams) {
	const { currentAddress } = useApiAuth();
	const epochQuery = useEpochInfo();
	const epochInfo = epochQuery.data;
	const multisigDetailsQuery = useGetMultisig(
		multisig.address,
	);
	const enabled = !!multisig.address && !!network;

	const proposalsQuery = usePaginatedProposals({
		multisigAddress: multisig.address,
		network,
		status: API_STATUS[activeFilter],
		perPage: PROPOSALS_PAGE_SIZE,
		enabled,
	});
	const failedQuery = usePaginatedProposals({
		multisigAddress: multisig.address,
		network,
		status: ProposalStatus.FAILURE,
		perPage: PROPOSALS_PAGE_SIZE,
		enabled: enabled && activeFilter === 'executed',
	});
	// Always loaded, for the pending tabs' counts. The pending tabs' own
	// query has the same key, so they share it.
	const pendingQuery = usePaginatedProposals({
		multisigAddress: multisig.address,
		network,
		status: ProposalStatus.PENDING,
		perPage: PROPOSALS_PAGE_SIZE,
		enabled,
	});

	const shownQueries =
		activeFilter === 'executed'
			? [proposalsQuery, failedQuery]
			: [proposalsQuery];

	const multisigDetails = multisigDetailsQuery.data;
	const publicKey = currentAddress?.publicKey;
	const classifyPending = useMemo(
		() => (proposal: ProposalWithSignatures) =>
			pendingFilter(proposal, {
				multisig: multisigDetails,
				publicKey,
				epochInfo,
			}),
		[epochInfo, multisigDetails, publicKey],
	);

	const proposalPages = proposalsQuery.data?.pages;
	const failedPages = failedQuery.data?.pages;
	const executedHasNext = proposalsQuery.hasNextPage;
	const failedHasNext = failedQuery.hasNextPage;
	// On Executed, the executed and failed lists, in `shownQueries` order.
	const executedLists = useMemo(
		() => [
			{
				rows:
					proposalPages?.flatMap((page) => page.data) ?? [],
				hasNextPage: executedHasNext,
			},
			{
				rows:
					failedPages?.flatMap((page) => page.data) ?? [],
				hasNextPage: failedHasNext,
			},
		],
		[
			proposalPages,
			failedPages,
			executedHasNext,
			failedHasNext,
		],
	);
	const filteredProposals = useMemo(() => {
		const loaded = proposalPages?.flatMap(
			(page) => page.data,
		);
		if (!loaded) return [];
		switch (activeFilter) {
			case 'pending':
			case 'waiting':
			case 'ready':
			case 'expired':
				return loaded.filter(
					(proposal) =>
						classifyPending(proposal) === activeFilter,
				);
			case 'executed':
				return mergeNewestFirst(executedLists);
			default:
				return loaded;
		}
	}, [
		proposalPages,
		executedLists,
		activeFilter,
		classifyPending,
	]);

	const pendingPages = pendingQuery.data?.pages;
	const pendingTabCounts = useMemo(() => {
		const counts = {
			pending: 0,
			waiting: 0,
			ready: 0,
			expired: 0,
		};
		if (!multisigDetails?.members) return counts;
		for (const page of pendingPages ?? [])
			for (const proposal of page.data)
				counts[classifyPending(proposal)]++;
		return counts;
	}, [pendingPages, multisigDetails, classifyPending]);

	// The counts' query is refreshed with the list, unless it is the list.
	const refreshedQueries =
		API_STATUS[activeFilter] === ProposalStatus.PENDING
			? shownQueries
			: [...shownQueries, pendingQuery];

	return {
		// Until the epoch is known nothing can be filed as expired, so the
		// first load waits for it. If it fails, nothing counts as expired.
		isLoading:
			shownQueries.some((query) => query.isLoading) ||
			multisigDetailsQuery.isLoading ||
			epochQuery.isLoading,
		// A failed background refetch keeps the loaded rows; only a
		// query with nothing to show blocks the list.
		error:
			shownQueries.find(
				(query) => !query.data && query.error,
			)?.error ??
			(multisigDetailsQuery.data
				? null
				: multisigDetailsQuery.error),
		filteredProposals,
		pendingTabCounts,
		pagination: {
			hasNextPage: shownQueries.some(
				(query) => query.hasNextPage,
			),
			// On Executed, only the lists whose next page can show more.
			fetchNextPage: () => {
				if (activeFilter === 'executed')
					for (const index of listsAtCutoff(executedLists))
						shownQueries[index].fetchNextPage();
				else if (proposalsQuery.hasNextPage)
					proposalsQuery.fetchNextPage();
			},
			isFetchingNextPage: shownQueries.some(
				(query) => query.isFetchingNextPage,
			),
			refetch: () => {
				for (const query of refreshedQueries)
					query.refetch();
			},
		},
		isRefetching:
			shownQueries.some((query) => query.isRefetching) ||
			multisigDetailsQuery.isRefetching,
		// Any of the queries can fail, so a retry refetches them all.
		retry: () => {
			for (const query of shownQueries) query.refetch();
			multisigDetailsQuery.refetch();
		},
	};
}
