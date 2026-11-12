// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type PublicProposal } from '@mysten/sagat';
import { useMemo } from 'react';

import { content } from '@/content';
import { useEpochInfo } from '@/hooks/useEpochInfo';
import { isProposalExpired } from '@/lib/proposalUtils';
import { memberLabels } from '@/lib/signers';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

import { EmptyState, ErrorState } from '../ui/empty-state';
import { ProposalsIcon } from '../ui/nav-icons';
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

const TABLE = content.proposals.table;
const FIELDS = content.common.fields;

/**
 * Proposals as a table, for the overview's open proposals and the full
 * list on the proposals page. Loading and errors keep the table's shell
 * and header so the page doesn't jump. With nothing to show, the list's
 * page-sized empty state stands alone and the overview keeps the table
 * with one line for a body. Test ids are `testId` plus `-loading`, `-error`
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
	proposals: PublicProposal[];
	variant: ProposalsTableVariant;
	loading: boolean;
	error: unknown;
	onRetry: () => void;
	empty: {
		title: string;
		description?: string;
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

	const noProposals =
		!loading && !error && proposals.length === 0;
	if (list && noProposals)
		return (
			<EmptyState
				icon={ProposalsIcon}
				title={empty.title}
				description={empty.description}
				size="page"
				testId={`${testId}-empty`}
			/>
		);

	return (
		// A container, so a narrow shell (a phone, or a narrow column) stacks
		// each row into a block instead of squeezing the columns.
		<div className={cn(tableShellClass, '@container')}>
			<table className={cn(tableClass, '@max-md:block')}>
				<thead className="@max-md:hidden">
					<tr className={tableShellHeadRowClass}>
						<th className="px-3">{TABLE.proposal}</th>
						<th className="w-20 px-3 sm:w-26">
							{FIELDS.status}
						</th>
						<th className="hidden w-32 px-3 sm:table-cell">
							{FIELDS.weight}
						</th>
						{list && (
							<th className="hidden w-44 px-3 md:table-cell">
								{TABLE.proposer}
							</th>
						)}
						<th
							className={cn(
								'px-3 text-right max-sm:pl-0',
								list ? 'w-36 sm:w-40' : 'w-22 sm:w-28',
							)}
						>
							<span className="sr-only">
								{FIELDS.actions}
							</span>
						</th>
					</tr>
				</thead>
				{!loading && !error && (
					<tbody className="@max-md:block">
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
							/>
						))}
						{noProposals && (
							<tr
								className="@max-md:block"
								data-testid={`${testId}-empty`}
							>
								<td
									colSpan={4}
									className="py-10 text-center text-14 text-muted-foreground @max-md:block"
								>
									{empty.title}
								</td>
							</tr>
						)}
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
					// The copy's own body, not the request's error message.
					<ErrorState
						title={TABLE.loadFailed}
						fallback={TABLE.loadFailedBody}
						onRetry={onRetry}
						className="rounded-none border-0"
						testId={`${testId}-error`}
					/>
				)
			)}
		</div>
	);
}
