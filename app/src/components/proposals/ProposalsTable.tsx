// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { FileText } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';

import { useEpochInfo } from '@/hooks/useEpochInfo';
import { isProposalExpired } from '@/lib/proposalUtils';
import { memberLabels } from '@/lib/signers';
import {
	type MultisigWithMembersForPublicKey,
	type ProposalCardInput,
} from '@/lib/types';
import { cn } from '@/lib/utils';

import { EmptyState, ErrorState } from '../ui/empty-state';
import { SkeletonRows } from '../ui/skeleton';
import {
	tableClass,
	tableShellClass,
	tableShellHeadRowClass,
} from '../ui/table';
import {
	ProposalRow,
	type ProposalsTableVariant,
} from './ProposalRow';

/**
 * Proposals as a table, for the overview's open proposals and the full
 * list on the proposals page. Loading and errors keep the table's shell
 * and header so the page doesn't jump; with nothing to show, the empty
 * state stands alone. Test ids are `testId` plus `-loading`, `-error`
 * and `-empty`.
 */
export function ProposalsTable({
	multisig,
	proposals,
	variant,
	loading,
	error,
	onRetry,
	empty,
	testId,
}: {
	multisig: MultisigWithMembersForPublicKey;
	proposals: ProposalCardInput[];
	variant: ProposalsTableVariant;
	loading: boolean;
	error: unknown;
	onRetry: () => void;
	empty: {
		title: string;
		description: string;
		action?: ReactNode;
	};
	testId: string;
}) {
	const { data: epochInfo } = useEpochInfo();
	// Proposers are named like signers: by their key's label, if any.
	const labels = useMemo(
		() => memberLabels(multisig.members),
		[multisig.members],
	);
	const list = variant === 'list';

	if (!loading && !error && proposals.length === 0)
		return (
			<EmptyState
				icon={FileText}
				title={empty.title}
				description={empty.description}
				action={empty.action}
				testId={`${testId}-empty`}
			/>
		);

	return (
		<div className={tableShellClass}>
			<table className={tableClass}>
				<thead>
					<tr className={tableShellHeadRowClass}>
						<th className="px-3">Proposal</th>
						<th className="w-20 px-3 sm:w-26">Status</th>
						<th className="hidden w-32 px-3 sm:table-cell">
							Weight
						</th>
						{list && (
							<th className="hidden w-44 px-3 md:table-cell">
								Proposer
							</th>
						)}
						<th
							className={cn(
								'px-3 text-right max-sm:pl-0',
								list ? 'w-28 sm:w-40' : 'w-22 sm:w-28',
							)}
						>
							<span className="sr-only">Actions</span>
						</th>
					</tr>
				</thead>
				{!loading && !error && (
					<tbody>
						{proposals.map((proposal) => (
							<ProposalRow
								key={proposal.id}
								proposal={proposal}
								variant={variant}
								expired={isProposalExpired(
									proposal,
									epochInfo,
								)}
								proposerLabel={
									labels.get(proposal.proposerAddress) ??
									null
								}
								columns={list ? 5 : 4}
							/>
						))}
					</tbody>
				)}
			</table>
			{loading ? (
				<SkeletonRows
					rows={list ? 5 : 3}
					header={false}
					className="rounded-none border-0"
					testId={`${testId}-loading`}
				/>
			) : (
				!!error && (
					<ErrorState
						title="Failed to load proposals"
						error={error}
						onRetry={onRetry}
						className="rounded-none border-0"
						testId={`${testId}-error`}
					/>
				)
			)}
		</div>
	);
}
