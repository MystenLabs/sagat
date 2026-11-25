// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	type ProposalList,
	type ProposalStatusName,
} from '@mysten/sagat/v1';
import { useMemo } from 'react';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { type SuiNetwork } from '@/lib/network';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import {
	isPodProposal,
	listsAtCutoff,
	mergeNewestFirst,
	pendingFilter,
	toProposalCardInput,
	type CountedProposal,
} from '../lib/proposalUtils';
import { usePodAliasSet } from './useAliasSets';
import { useEpochInfo } from './useEpochInfo';
import { useNeverProposed } from './useNeverProposed';
import {
	PROPOSALS_PAGE_SIZE,
	usePaginatedProposals,
} from './usePaginatedProposals';

export type ProposalFilter =
	| 'pending'
	| 'waiting'
	| 'ready'
	| 'executed'
	| 'cancelled'
	| 'expired'
	| 'all';

// The status each tab asks the API for. The pending tabs all load the
// pending proposals and split them here; Executed adds failed executions
// from a second query, since the endpoint takes one status.
const API_STATUS: Record<
	ProposalFilter,
	ProposalStatusName | undefined
> = {
	pending: 'PENDING',
	waiting: 'PENDING',
	ready: 'PENDING',
	executed: 'SUCCESS',
	cancelled: 'CANCELLED',
	expired: 'PENDING',
	all: undefined,
};

/** Router state that opens the proposals page on a given tab. */
export interface ProposalsPageState {
	filter: ProposalFilter;
}

function isProposalFilter(
	value: unknown,
): value is ProposalFilter {
	return (
		typeof value === 'string' &&
		Object.keys(API_STATUS).includes(value)
	);
}

/** The tab the page opens on: the one in the router state, else To sign. */
export function initialProposalFilter(
	state: unknown,
): ProposalFilter {
	const filter =
		typeof state === 'object' &&
		state !== null &&
		'filter' in state
			? state.filter
			: undefined;
	return isProposalFilter(filter) ? filter : 'pending';
}

interface UseProposalsQueriesParams {
	multisig: MultisigWithMembersForPublicKey;
	network: SuiNetwork;
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
	const aliases = usePodAliasSet(multisig.address, {
		network,
	});
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
		status: 'FAILURE',
		perPage: PROPOSALS_PAGE_SIZE,
		enabled: enabled && activeFilter === 'executed',
	});
	// Always loaded, for the pending tabs' counts. The pending tabs' own
	// query has the same key, so they share it.
	const pendingQuery = usePaginatedProposals({
		multisigAddress: multisig.address,
		network,
		status: 'PENDING',
		perPage: PROPOSALS_PAGE_SIZE,
		enabled,
	});

	const shownQueries =
		activeFilter === 'executed'
			? [proposalsQuery, failedQuery]
			: [proposalsQuery];

	const publicKey = currentAddress?.publicKey;
	const signerAddress = currentAddress?.address;
	const classifyPending = useMemo(
		() => (proposal: CountedProposal) =>
			pendingFilter(proposal, {
				publicKey,
				epochInfo,
			}),
		[epochInfo, publicKey],
	);
	// Each list's rows of this pod and network, counted against the sets the pod's alias read passes.
	const counted = useMemo(
		() => (pages: ProposalList[] | undefined) =>
			pages?.flatMap((page) =>
				page.proposals
					.filter((proposal) =>
						isPodProposal(
							proposal,
							multisig.address,
							network,
						),
					)
					.map((proposal) =>
						toProposalCardInput(
							proposal,
							aliases,
							signerAddress,
						),
					),
			),
		[aliases, signerAddress, multisig.address, network],
	);

	const proposalPages = useMemo(
		() => counted(proposalsQuery.data?.pages),
		[counted, proposalsQuery.data],
	);
	const failedPages = useMemo(
		() => counted(failedQuery.data?.pages),
		[counted, failedQuery.data],
	);
	const executedHasNext = proposalsQuery.hasNextPage;
	const failedHasNext = failedQuery.hasNextPage;
	// On Executed, the executed and failed lists, in `shownQueries` order.
	const executedLists = useMemo(
		() => [
			{
				rows: proposalPages ?? [],
				hasNextPage: executedHasNext,
			},
			{
				rows: failedPages ?? [],
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
		const loaded = proposalPages;
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

	const pendingRows = useMemo(
		() => counted(pendingQuery.data?.pages),
		[counted, pendingQuery.data],
	);
	const pendingTabCounts = useMemo(() => {
		const counts = {
			pending: 0,
			waiting: 0,
			ready: 0,
			expired: 0,
		};
		for (const proposal of pendingRows ?? [])
			counts[classifyPending(proposal)]++;
		return counts;
	}, [pendingRows, classifyPending]);

	// The counts' query is refreshed with the list, unless it is the list.
	const refreshedQueries =
		API_STATUS[activeFilter] === 'PENDING'
			? shownQueries
			: [...shownQueries, pendingQuery];

	// Until the epoch is known nothing can be filed as expired, so the
	// first load waits for it. If it fails, nothing counts as expired.
	const tabLoading =
		shownQueries.some((query) => query.isPending) ||
		epochQuery.isPending;
	// A failed background refetch keeps the loaded rows; only a
	// query with nothing to show blocks the list.
	const error =
		shownQueries.find((query) => !query.data && query.error)
			?.error ?? null;
	const pendingHasRows = !!pendingRows?.length;
	// An empty tab asks whether the account has any proposal at all.
	const mayHaveNone =
		enabled &&
		!tabLoading &&
		!error &&
		filteredProposals.length === 0 &&
		!pendingHasRows;
	const never = useNeverProposed({
		multisigAddress: multisig.address,
		network,
		enabled: mayHaveNone && !pendingQuery.isPending,
	});

	return {
		isLoading:
			tabLoading ||
			never.isPending ||
			(mayHaveNone && pendingQuery.isPending),
		error,
		// If the check fails, the tab's own empty state still holds.
		neverProposed: never.neverProposed,
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
		isRefetching: shownQueries.some(
			(query) => query.isRefetching,
		),
		// Any of the queries can fail, so a retry refetches them all.
		retry: () => {
			for (const query of shownQueries) query.refetch();
		},
	};
}
