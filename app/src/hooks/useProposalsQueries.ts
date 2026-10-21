// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	type PublicProposal,
} from '@mysten/sagat';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { isReadyToExecute as anySetReady } from '@/lib/proposalUtils';
import { type AccountForPublicKey } from '@/lib/types';

import { useGetAccount } from './useGetAccount';
import { usePaginatedProposals } from './usePaginatedProposals';

interface UseProposalsQueriesParams {
	multisig: AccountForPublicKey;
	network: string;
	activeFilter:
		| 'all'
		| 'pending'
		| 'waiting'
		| 'ready'
		| 'executed'
		| 'cancelled';
}

export function useProposalsQueries({
	multisig,
	network,
	activeFilter,
}: UseProposalsQueriesParams) {
	const { currentAddress } = useApiAuth();

	// For the proposers and signer set labels the cards show.
	const accountQuery = useGetAccount(multisig.address);

	// Get API query type based on active tab
	const getApiQueryType = () => {
		switch (activeFilter) {
			case 'executed':
				return 'executed';
			case 'cancelled':
				return 'cancelled';
			case 'pending':
			case 'waiting':
			case 'ready':
				return 'pending';
			default:
				return 'all';
		}
	};

	const apiQueryType = getApiQueryType();

	// Get API filter params based on query type
	const getStatusFilter = () => {
		switch (apiQueryType) {
			case 'executed':
				return ProposalStatus.SUCCESS;
			case 'cancelled':
				return ProposalStatus.CANCELLED;
			case 'pending':
				return ProposalStatus.PENDING;
			default:
				return undefined; // All proposals
		}
	};

	// Use infinite query for all tabs (pending will just have 1 page)
	const proposalsQuery = usePaginatedProposals({
		accountAddress: multisig.address,
		network,
		status: getStatusFilter(),
		perPage: 10,
		enabled: !!multisig.address && !!network,
	});

	// Always fetch pending proposals for counts
	const pendingProposalsQuery = usePaginatedProposals({
		accountAddress: multisig.address,
		network,
		status: ProposalStatus.PENDING,
		perPage: 10,
		enabled: !!multisig.address && !!network,
	});

	// Helper to check if current user has signed a proposal
	const userHasSignedProposal = (
		proposal: PublicProposal,
	) => {
		if (!currentAddress) return false;
		return proposal.signatures.some(
			(sig) => sig.publicKey === currentAddress.publicKey,
		);
	};

	// Whether a pending proposal can be executed now: some signer set
	// valid on its network reached its threshold, as the server counts it.
	const isReady = (proposal: PublicProposal) =>
		anySetReady(proposal.signerSets);

	// Pending, not signed by the current user, and short of the threshold.
	const isPendingForUser = (p: PublicProposal) =>
		p.status === ProposalStatus.PENDING &&
		!userHasSignedProposal(p) &&
		!isReady(p);

	// Pending, signed by the current user, and short of the threshold.
	const isWaitingForOthers = (p: PublicProposal) =>
		p.status === ProposalStatus.PENDING &&
		userHasSignedProposal(p) &&
		!isReady(p);

	const isReadyToExecute = (p: PublicProposal) =>
		p.status === ProposalStatus.PENDING && isReady(p);

	// Filter proposals based on current tab
	const getFilteredProposals = (
		proposals: PublicProposal[],
	) => {
		switch (activeFilter) {
			case 'pending':
				return proposals.filter(isPendingForUser);
			case 'waiting':
				return proposals.filter(isWaitingForOthers);
			case 'ready':
				return proposals.filter(isReadyToExecute);
			default:
				return proposals;
		}
	};

	// Calculate counts for pending tabs
	const getPendingTabCounts = () => {
		const pendingProposals =
			pendingProposalsQuery.data?.pages.flatMap(
				(page) => page.data,
			) ?? [];

		if (!pendingProposals.length) {
			return { pending: 0, waiting: 0, ready: 0 };
		}

		return {
			pending: pendingProposals.filter(isPendingForUser)
				.length,
			waiting: pendingProposals.filter(isWaitingForOthers)
				.length,
			ready: pendingProposals.filter(isReadyToExecute)
				.length,
		};
	};

	// Flatten all loaded pages into a single array
	const currentProposals: PublicProposal[] =
		proposalsQuery.data?.pages.flatMap(
			(page) => page.data,
		) ?? [];

	return {
		// Queries
		account: accountQuery.data,
		proposals: currentProposals,
		isLoading:
			proposalsQuery.isLoading || accountQuery.isLoading,
		error: proposalsQuery.error || accountQuery.error,

		// Filtered data
		filteredProposals: getFilteredProposals(
			currentProposals,
		),
		pendingTabCounts: getPendingTabCounts(),

		// Pagination (always return, LoadMoreButton checks hasNextPage)
		pagination: {
			hasNextPage: proposalsQuery.hasNextPage,
			fetchNextPage: proposalsQuery.fetchNextPage,
			isFetchingNextPage: proposalsQuery.isFetchingNextPage,
			refetch: proposalsQuery.refetch,
		},
		isRefetching: proposalsQuery.isRefetching,
		// Helpers
		userHasSignedProposal,
	};
}
