import { type ProposalWithSignatures } from '@mysten/sagat';
import { FileText, Plus } from 'lucide-react';
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

interface ProposalsTabContext {
	multisig: MultisigWithMembersForPublicKey;
	openProposalSheet: () => void;
}

export function ProposalsTab() {
	const { multisig, openProposalSheet } =
		useOutletContext<ProposalsTabContext>();
	const { network } = useNetwork();
	const [activeFilter, setActiveFilter] = useState<
		| 'all'
		| 'pending'
		| 'waiting'
		| 'ready'
		| 'executed'
		| 'cancelled'
	>('all');

	// Use the new hook to manage all queries and filtering
	const {
		filteredProposals,
		pendingTabCounts,
		isLoading,
		error,
	} = useProposalsQueries({
		multisig,
		network,
		activeFilter,
	});

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

	if (isLoading) {
		return (
			<div className="text-center">
				<div className="animate-pulse space-y-4">
					<div className="h-8 bg-gray-200 rounded w-1/4 mx-auto"></div>
					<div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="text-center">
				<FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
				<h3 className="text-lg font-medium mb-2">
					Failed to load proposals
				</h3>
				<p className="text-gray-600 mb-4">
					{(error as Error).message}
				</p>
			</div>
		);
	}

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
		<div className="h-full flex flex-col px-3">
			<div>
				{/* Filter tabs */}
				<div className="flex gap-2 overflow-x-auto py-3">
					{filters.map((filter) => {
						const isActive = activeFilter === filter.id;
						return (
							<button
								key={filter.id}
								onClick={() =>
									setActiveFilter(
										filter.id as typeof activeFilter,
									)
								}
								className={`
                  px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer shrink-0
                  ${isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}
                `}
							>
								{filter.label}
								{/* Only show count for pending state tabs */}
								{filter.count !== undefined &&
									filter.count > 0 && (
										<Label
											variant={
												isActive ? 'info' : 'neutral'
											}
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
			</div>

			<div className="flex-1 overflow-y-auto mt-6">
				{filteredProposals.length === 0 ? (
					<div className="text-center py-12">
						<FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
						<h3 className="text-lg font-medium mb-2">
							No proposals found
						</h3>
						<p className="text-gray-600 mb-4">
							{activeFilter === 'all'
								? 'Create your first proposal to get started'
								: `No proposals in "${filters.find((f) => f.id === activeFilter)?.label}" state`}
						</p>
						{activeFilter === 'all' && (
							<Button onClick={openProposalSheet} size="sm">
								<Plus className="w-4 h-4 mr-1" />
								Create Proposal
							</Button>
						)}
					</div>
				) : (
					<div className="space-y-4">
						{filteredProposals.map((proposal) => (
							<ProposalCard
								key={proposal.id}
								proposal={formatProposal(proposal)}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
