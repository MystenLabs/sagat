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
import { Tabs } from '../ui/tabs';

const COPY = content.proposals;

interface ProposalsTabContext {
	multisig: MultisigWithMembersForPublicKey;
}

/** After a manual refresh, the button rests this long. */
const REFRESH_COOLDOWN_MS = 5000;

// What an empty tab says. All, the first visit's tab, also offers to
// start one.
const EMPTY_TITLE: Record<ProposalFilter, string> =
	COPY.empty.title;

/**
 * The account's proposals, filtered by where they stand: all of them, the
 * open ones split by who has to act next, and the finished ones by how
 * they ended.
 */
export function ProposalsTab() {
	const { multisig } =
		useOutletContext<ProposalsTabContext>();
	const navigate = useNavigate();
	const { network } = useNetwork();
	const [activeFilter, setActiveFilter] =
		useState<ProposalFilter>('all');
	const [isRefreshCooldown, setIsRefreshCooldown] =
		useState(false);

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
		{ id: 'all', label: tabs.all },
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
	];

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<Tabs
					tabs={filters}
					activeTab={activeFilter}
					onTabChange={(id) =>
						setActiveFilter(id as ProposalFilter)
					}
					variant="pills"
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
				empty={{
					title: EMPTY_TITLE[activeFilter],
					description:
						activeFilter === 'all'
							? COPY.empty.allDescription
							: COPY.empty.description,
					action: activeFilter === 'all' && (
						<Button
							size="sm"
							onClick={() =>
								navigate(newProposalPath(multisig.address))
							}
						>
							<Plus />
							{content.common.actions.newProposal}
						</Button>
					),
				}}
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
