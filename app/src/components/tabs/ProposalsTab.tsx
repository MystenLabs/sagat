// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Plus, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
	useNavigate,
	useOutletContext,
} from 'react-router-dom';

import { content } from '@/content';
import { newProposalPath } from '@/lib/new-proposal';
import { toProposalCardInput } from '@/lib/proposalUtils';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

import { useNetwork } from '../../contexts/NetworkContext';
import {
	useProposalsQueries,
	type ProposalFilter,
} from '../../hooks/useProposalsQueries';
import { ProposalsTable } from '../proposals/ProposalsTable';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { ProposalsIcon } from '../ui/nav-icons';
import { Tabs } from '../ui/tabs';

const COPY = content.proposals;

interface ProposalsTabContext {
	multisig: MultisigWithMembersForPublicKey;
}

/** After a manual refresh, the button rests this long. */
const REFRESH_COOLDOWN_MS = 5000;

/**
 * The account's proposals, filtered by where they stand: the open ones
 * split by who has to act next, the finished ones by how they ended, and
 * all of them. Opens on the ones waiting for the user's signature.
 */
export function ProposalsTab() {
	const { multisig } =
		useOutletContext<ProposalsTabContext>();
	const navigate = useNavigate();
	const { network } = useNetwork();
	const [activeFilter, setActiveFilter] =
		useState<ProposalFilter>('pending');
	const [isRefreshCooldown, setIsRefreshCooldown] =
		useState(false);

	const {
		filteredProposals,
		pendingTabCounts,
		neverProposed,
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
	const proposals = useMemo(
		() =>
			filteredProposals.map((proposal) =>
				toProposalCardInput(proposal, multisig),
			),
		[filteredProposals, multisig],
	);

	const handleRefresh = () => {
		if (isRefreshCooldown || isRefetching) return;
		setIsRefreshCooldown(true);
		pagination.refetch();
		setTimeout(
			() => setIsRefreshCooldown(false),
			REFRESH_COOLDOWN_MS,
		);
	};

	const tabs = COPY.tabs;
	const filters: {
		id: ProposalFilter;
		label: string;
		count?: number;
	}[] = [
		{
			id: 'pending',
			label: tabs.pending,
			count: pendingTabCounts.pending,
		},
		{
			id: 'waiting',
			label: tabs.waiting,
			count: pendingTabCounts.waiting,
		},
		{
			id: 'ready',
			label: tabs.ready,
			count: pendingTabCounts.ready,
		},
		{ id: 'executed', label: tabs.executed },
		{ id: 'cancelled', label: tabs.cancelled },
		{
			id: 'expired',
			label: tabs.expired,
			// Expired proposals still count against the account's open
			// proposals until cancelled, so the tab says how many wait there.
			count: pendingTabCounts.expired,
		},
		{ id: 'all', label: tabs.all },
	];

	if (neverProposed)
		return (
			<EmptyState
				icon={ProposalsIcon}
				title={COPY.empty.none.title}
				description={COPY.empty.none.description}
				action={
					<Button
						onClick={() =>
							navigate(newProposalPath(multisig.address))
						}
						data-testid="proposals-empty-new-proposal"
					>
						<Plus />
						{content.common.actions.newProposal}
					</Button>
				}
				size="page"
				testId="proposals-empty"
			/>
		);
	// All shares the check's query, so it is only empty when there are none.
	const empty =
		activeFilter === 'all'
			? COPY.empty.none
			: COPY.empty.tabs[activeFilter];

	return (
		<div className="flex flex-1 flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<Tabs
					tabs={filters}
					activeTab={activeFilter}
					onTabChange={(id) =>
						setActiveFilter(id as ProposalFilter)
					}
					testId="proposal-filter"
				/>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={handleRefresh}
					disabled={isRefreshCooldown || isRefetching}
					aria-label={COPY.refresh}
					title={COPY.refresh}
					data-testid="refresh-proposals-button"
				>
					<RefreshCw
						className={cn(isRefetching && 'animate-spin')}
					/>
				</Button>
			</div>

			<ProposalsTable
				multisig={multisig}
				proposals={proposals}
				variant="list"
				loading={isLoading}
				error={error}
				onRetry={retry}
				empty={empty}
				testId="proposals"
			/>

			{!isLoading && !error && pagination.hasNextPage && (
				<div className="flex justify-center">
					<Button
						variant="outline"
						size="sm"
						onClick={pagination.fetchNextPage}
						disabled={pagination.isFetchingNextPage}
						data-testid="load-more-proposals"
					>
						{pagination.isFetchingNextPage
							? content.common.states.loadingMore
							: content.common.actions.loadMore}
					</Button>
				</div>
			)}
		</div>
	);
}
