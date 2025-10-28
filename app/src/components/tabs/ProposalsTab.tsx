// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ProposalWithSignatures } from '@mysten/sagat';
import { FileText, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';

import { calculateCurrentWeight } from '@/lib/proposalUtils';
import {
	type MultisigWithMembersForPublicKey,
	type ProposalCardInput,
} from '@/lib/types';

import { useNetwork } from '../../contexts/NetworkContext';
import { useProposalsQueries } from '../../hooks/useProposalsQueries';
import { ProposalCard } from '../proposals/ProposalCard';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { SkeletonList } from '../ui/skeleton';

interface ProposalsTabContext {
	multisig: MultisigWithMembersForPublicKey;
	openProposalSheet: () => void;
}

type FilterType =
	| 'all'
	| 'pending'
	| 'waiting'
	| 'ready'
	| 'executed'
	| 'cancelled';

// Error State Component
function ErrorState({ error }: { error: Error }) {
	return (
		<div className="text-center py-12">
			<FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
			<h3 className="text-lg font-medium mb-2">
				Failed to load proposals
			</h3>
			<p className="text-gray-600 mb-4">{error.message}</p>
		</div>
	);
}

// Filter Tabs Component
function FilterTabs({
	filters,
	activeFilter,
	onFilterChange,
	onRefresh,
	isRefreshCooldown,
	isRefetching,
}: {
	filters: Array<{
		id: string;
		label: string;
		count?: number;
	}>;
	activeFilter: FilterType;
	onFilterChange: (filter: FilterType) => void;
	onRefresh: () => void;
	isRefreshCooldown: boolean;
	isRefetching: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-2 py-3">
			<div className="flex gap-2 overflow-x-auto">
				{filters.map((filter) => {
					const isActive = activeFilter === filter.id;
					return (
						<button
							key={filter.id}
							onClick={() =>
								onFilterChange(filter.id as FilterType)
							}
							className={`
								px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer shrink-0
								${isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}
							`}
						>
							{filter.label}
							{filter.count !== undefined &&
								filter.count > 0 && (
									<Label
										variant={isActive ? 'info' : 'neutral'}
										size="sm"
										className="ml-2"
									>
										{filter.count}
									</Label>
								)}
						</button>
					);
				})}
			</div>
			{/* Refresh button for all tabs */}
			<Button
				variant="ghost"
				size="sm"
				onClick={onRefresh}
				disabled={isRefreshCooldown || isRefetching}
				className="shrink-0"
				title="Refresh proposals (5s cooldown)"
			>
				<RefreshCw
					className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`}
				/>
			</Button>
		</div>
	);
}

// Empty State Component
function EmptyState({
	activeFilter,
	filterLabel,
	onCreateProposal,
}: {
	activeFilter: FilterType;
	filterLabel?: string;
	onCreateProposal: () => void;
}) {
	return (
		<div className="text-center py-12">
			<FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
			<h3 className="text-lg font-medium mb-2">
				No proposals found
			</h3>
			<p className="text-gray-600 mb-4">
				{activeFilter === 'all'
					? 'Create your first proposal to get started'
					: `No proposals in "${filterLabel}" state`}
			</p>
			{activeFilter === 'all' && (
				<Button onClick={onCreateProposal} size="sm">
					<Plus className="w-4 h-4 mr-1" />
					Create Proposal
				</Button>
			)}
		</div>
	);
}

// Proposals List Component
function ProposalsList({
	proposals,
	multisig,
}: {
	proposals: ProposalWithSignatures[];
	multisig: MultisigWithMembersForPublicKey;
}) {
	const formatProposal = (
		proposal: ProposalWithSignatures,
	): ProposalCardInput => {
		return {
			...proposal,
			isPublic: false,
			totalWeight: multisig.threshold,
			currentWeight: calculateCurrentWeight(
				proposal,
				multisig,
			),
			proposers: multisig.proposers.map(
				(proposer) => proposer.address,
			),
			multisig: {
				address: multisig.address,
				threshold: multisig.threshold,
				members: multisig.members.map((member) => ({
					...member,
					publicKey: member.publicKey,
				})),
			},
		};
	};

	return (
		<div className="space-y-4">
			{proposals.map((proposal) => (
				<ProposalCard
					key={proposal.id}
					proposal={formatProposal(proposal)}
				/>
			))}
		</div>
	);
}

// Load More Button Component
function LoadMoreButton({
	pagination,
}: {
	pagination?: {
		hasNextPage: boolean;
		fetchNextPage: () => void;
		isFetchingNextPage: boolean;
	};
}) {
	if (!pagination || !pagination.hasNextPage) {
		return null;
	}

	return (
		<div className="flex items-center justify-center py-4 border-t">
			<Button
				variant="outline"
				size="sm"
				onClick={() => pagination.fetchNextPage()}
				disabled={pagination.isFetchingNextPage}
			>
				{pagination.isFetchingNextPage
					? 'Loading...'
					: 'Load More'}
			</Button>
		</div>
	);
}

// Main Component
export function ProposalsTab() {
	const { multisig, openProposalSheet } =
		useOutletContext<ProposalsTabContext>();
	const { network } = useNetwork();
	const [activeFilter, setActiveFilter] =
		useState<FilterType>('all');
	const [isRefreshCooldown, setIsRefreshCooldown] =
		useState(false);

	// Use the new hook to manage all queries and filtering
	const {
		filteredProposals,
		pendingTabCounts,
		isLoading,
		error,
		pagination,
		isRefetching,
	} = useProposalsQueries({
		multisig,
		network,
		activeFilter,
	});

	// Handle refresh with cooldown (5 seconds)
	const handleRefresh = () => {
		if (isRefreshCooldown || isRefetching) {
			return;
		}

		setIsRefreshCooldown(true);
		pagination.refetch();

		// Reset cooldown after 5 seconds
		setTimeout(() => {
			setIsRefreshCooldown(false);
		}, 5000);
	};

	const filters = [
		{ id: 'all', label: 'All' },
		{
			id: 'pending',
			label: 'Pending Signature',
			count: pendingTabCounts.pending,
		},
		{
			id: 'waiting',
			label: 'Waiting for Others',
			count: pendingTabCounts.waiting,
		},
		{
			id: 'ready',
			label: 'Ready to Execute',
			count: pendingTabCounts.ready,
		},
		{ id: 'executed', label: 'Executed' },
		{ id: 'cancelled', label: 'Cancelled' },
	];

	return (
		<div className="h-full flex flex-col px-3">
			<div>
				<FilterTabs
					filters={filters}
					activeFilter={activeFilter}
					onFilterChange={setActiveFilter}
					onRefresh={handleRefresh}
					isRefreshCooldown={isRefreshCooldown}
					isRefetching={isRefetching}
				/>
			</div>

			<div className="flex-1 overflow-y-auto mt-6">
				{isLoading || isRefetching ? (
					<SkeletonList />
				) : error ? (
					<ErrorState error={error as Error} />
				) : filteredProposals.length === 0 ? (
					<EmptyState
						activeFilter={activeFilter}
						filterLabel={
							filters.find((f) => f.id === activeFilter)
								?.label
						}
						onCreateProposal={openProposalSheet}
					/>
				) : (
					<ProposalsList
						proposals={filteredProposals}
						multisig={multisig}
					/>
				)}
			</div>

			{!isLoading &&
				!isRefetching &&
				filteredProposals.length > 0 && (
					<LoadMoreButton pagination={pagination} />
				)}
		</div>
	);
}
