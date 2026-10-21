// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ProposalWithSignatures } from '@mysten/sagat';
import { FileText, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';

import { toProposalCardInput } from '@/lib/proposalUtils';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { useNetwork } from '../../contexts/NetworkContext';
import { useProposalsQueries } from '../../hooks/useProposalsQueries';
import { ProposalCard } from '../proposals/ProposalCard';
import { Button } from '../ui/button';
import { EmptyState, ErrorState } from '../ui/empty-state';
import { SkeletonRows } from '../ui/skeleton';
import { Tabs } from '../ui/tabs';

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
			<Tabs
				tabs={filters}
				activeTab={activeFilter}
				onTabChange={(id) =>
					onFilterChange(id as FilterType)
				}
				variant="pills"
				testId="proposal-filter"
			/>
			{/* Refresh button for all tabs */}
			<Button
				variant="ghost"
				size="sm"
				onClick={onRefresh}
				disabled={isRefreshCooldown || isRefetching}
				className="shrink-0"
				title="Refresh proposals (5s cooldown)"
				data-testid="refresh-proposals-button"
			>
				<RefreshCw
					className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`}
				/>
			</Button>
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
	return (
		<div className="space-y-4">
			{proposals.map((proposal) => (
				<ProposalCard
					key={proposal.id}
					proposal={toProposalCardInput(proposal, multisig)}
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
		retry,
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
				{isLoading ? (
					<SkeletonRows
						rows={5}
						testId="proposals-loading"
					/>
				) : error ? (
					<ErrorState
						title="Failed to load proposals"
						error={error}
						onRetry={retry}
						testId="proposals-error"
					/>
				) : filteredProposals.length === 0 ? (
					<EmptyState
						icon={FileText}
						title={
							activeFilter === 'all'
								? 'No proposals yet'
								: 'No matching proposals'
						}
						description={
							activeFilter === 'all'
								? 'Create the first proposal for this account.'
								: `No proposals are in “${filters.find((f) => f.id === activeFilter)?.label ?? activeFilter}”.`
						}
						action={
							activeFilter === 'all' && (
								<Button
									onClick={openProposalSheet}
									size="sm"
								>
									<Plus />
									New proposal
								</Button>
							)
						}
						testId="proposals-empty"
					/>
				) : (
					<ProposalsList
						proposals={filteredProposals}
						multisig={multisig}
					/>
				)}
			</div>

			{!isLoading && filteredProposals.length > 0 && (
				<LoadMoreButton pagination={pagination} />
			)}
		</div>
	);
}
