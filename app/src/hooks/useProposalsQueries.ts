// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	type ProposalWithSignatures,
} from '@mysten/sagat';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import {
	calculateCurrentWeight,
	getTotalWeight,
} from '../lib/proposalUtils';
import { useGetMultisig } from './useGetMultisig';
import { usePaginatedProposals } from './usePaginatedProposals';

interface UseProposalsQueriesParams {
	multisig: MultisigWithMembersForPublicKey;
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

	const multisigDetailsQuery = useGetMultisig(
		multisig.address,
	);

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
		multisigAddress: multisig.address,
		network,
		status: getStatusFilter(),
		perPage: 10,
		enabled: !!multisig.address && !!network,
	});

	// Always fetch pending proposals for counts
	const pendingProposalsQuery = usePaginatedProposals({
		multisigAddress: multisig.address,
		network,
		status: ProposalStatus.PENDING,
		perPage: 10,
		enabled: !!multisig.address && !!network,
	});

	// Helper to check if current user has signed a proposal
	const userHasSignedProposal = (
		proposal: ProposalWithSignatures,
	) => {
		if (!currentAddress) return false;
		return proposal.signatures.some(
			(sig) => sig.publicKey === currentAddress.publicKey,
		);
	};

	// Filter proposals based on current tab
	const getFilteredProposals = (
		proposals: ProposalWithSignatures[],
	) => {
		const multisigDetails = multisigDetailsQuery.data;

		switch (activeFilter) {
			case 'pending':
				return proposals.filter((p) => {
					if (p.status !== ProposalStatus.PENDING)
						return false;
					const hasUserSigned = userHasSignedProposal(p);
					const currentWeight = calculateCurrentWeight(
						p,
						multisigDetails,
					);
					const totalWeight =
						getTotalWeight(multisigDetails);
					const needsMoreSigs = currentWeight < totalWeight;
					return !hasUserSigned && needsMoreSigs;
				});

			case 'waiting':
				return proposals.filter((p) => {
					if (p.status !== ProposalStatus.PENDING)
						return false;
					const hasUserSigned = userHasSignedProposal(p);
					const currentWeight = calculateCurrentWeight(
						p,
						multisigDetails,
					);
					const totalWeight =
						getTotalWeight(multisigDetails);
					const needsMoreSigs = currentWeight < totalWeight;
					return hasUserSigned && needsMoreSigs;
				});

			case 'ready':
				return proposals.filter((p) => {
					const currentWeight = calculateCurrentWeight(
						p,
						multisigDetails,
					);
					const totalWeight =
						getTotalWeight(multisigDetails);
					return (
						p.status === ProposalStatus.PENDING &&
						currentWeight >= totalWeight
					);
				});

			case 'executed':
				return proposals;

			case 'cancelled':
				return proposals;

			default:
				return proposals;
		}
	};

	// Calculate counts for pending tabs
	const getPendingTabCounts = () => {
		const multisigDetails = multisigDetailsQuery.data;
		const pendingProposals =
			pendingProposalsQuery.data?.pages.flatMap(
				(page) => page.data,
			) ?? [];

		if (
			!multisigDetails?.members ||
			!pendingProposals.length
		) {
			return { pending: 0, waiting: 0, ready: 0 };
		}

		const pendingCount = pendingProposals.filter((p) => {
			if (p.status !== ProposalStatus.PENDING) return false;
			const hasUserSigned = userHasSignedProposal(p);
			const currentWeight = calculateCurrentWeight(
				p,
				multisigDetails,
			);
			const totalWeight = getTotalWeight(multisigDetails);
			const needsMoreSigs = currentWeight < totalWeight;
			return !hasUserSigned && needsMoreSigs;
		}).length;

		const waitingCount = pendingProposals.filter((p) => {
			if (p.status !== ProposalStatus.PENDING) return false;
			const hasUserSigned = userHasSignedProposal(p);
			const currentWeight = calculateCurrentWeight(
				p,
				multisigDetails,
			);
			const totalWeight = getTotalWeight(multisigDetails);
			const needsMoreSigs = currentWeight < totalWeight;
			return hasUserSigned && needsMoreSigs;
		}).length;

		const readyCount = pendingProposals.filter((p) => {
			const currentWeight = calculateCurrentWeight(
				p,
				multisigDetails,
			);
			const totalWeight = getTotalWeight(multisigDetails);
			return (
				p.status === ProposalStatus.PENDING &&
				currentWeight >= totalWeight
			);
		}).length;

		return {
			pending: pendingCount,
			waiting: waitingCount,
			ready: readyCount,
		};
	};

	// Flatten all loaded pages into a single array
	const currentProposals: ProposalWithSignatures[] =
		proposalsQuery.data?.pages.flatMap(
			(page) => page.data,
		) ?? [];

	return {
		// Queries
		multisigDetails: multisigDetailsQuery.data,
		proposals: currentProposals,
		isLoading:
			proposalsQuery.isLoading ||
			multisigDetailsQuery.isLoading,
		error:
			proposalsQuery.error || multisigDetailsQuery.error,

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
