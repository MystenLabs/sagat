// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { ChevronRight, FileText } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useExecuteOrVerify } from '@/hooks/useExecuteProposal';
import {
	PROPOSALS_PAGE_SIZE,
	usePaginatedProposals,
} from '@/hooks/usePaginatedProposals';
import {
	proposalStatusKey,
	proposalTitle,
	toProposalCardInput,
} from '@/lib/proposalUtils';
import { memberLabels } from '@/lib/signers';
import {
	type MultisigWithMembersForPublicKey,
	type ProposalCardInput,
} from '@/lib/types';
import { cn } from '@/lib/utils';

import { ProposalExpiry } from '../proposals/ProposalExpiry';
import { ProposalStatusChip } from '../proposals/ProposalStatusChip';
import { ProposalWeight } from '../proposals/ProposalWeight';
import { Button, buttonVariants } from '../ui/button';
import { CardHeading } from '../ui/card';
import { EmptyState, ErrorState } from '../ui/empty-state';
import { SkeletonRows } from '../ui/skeleton';
import {
	tableClass,
	tableRowClass,
	tableShellClass,
	tableShellHeadRowClass,
} from '../ui/table';
import { SignerName } from './SignerName';

/** The overview lists this many open proposals; the rest are on the proposals tab. */
const OPEN_PROPOSALS_SHOWN = 5;

/**
 * The account's open proposals as a table: what each proposes, who
 * proposed it and when it expires, where it stands, its signature weight,
 * and Execute once it has enough. Links to the proposals tab for the full
 * list.
 */
export function OpenProposals({
	multisig,
}: {
	multisig: MultisigWithMembersForPublicKey;
}) {
	const { network } = useNetwork();
	const { currentAddress } = useApiAuth();
	const query = usePaginatedProposals({
		multisigAddress: multisig.address,
		network,
		status: ProposalStatus.PENDING,
		// The proposals tab's page size, so both share one cached query.
		perPage: PROPOSALS_PAGE_SIZE,
	});
	const proposals = useMemo(
		() =>
			(query.data?.pages[0]?.data ?? [])
				.slice(0, OPEN_PROPOSALS_SHOWN)
				.map((proposal) =>
					toProposalCardInput(proposal, multisig),
				),
		[query.data, multisig],
	);
	// Proposers are named like signers: by their key's label, if any.
	const labels = useMemo(
		() => memberLabels(multisig.members),
		[multisig.members],
	);

	return (
		<section
			className="flex flex-col gap-3"
			aria-labelledby="open-proposals-title"
			data-testid="open-proposals"
		>
			<CardHeading
				id="open-proposals-title"
				title="Open proposals"
			>
				<Link
					to={`/multisig/${multisig.address}/proposals`}
					className={cn(
						buttonVariants({
							variant: 'ghost',
							size: 'sm',
						}),
						'-mr-2.5 ml-auto gap-1 text-foreground-secondary',
					)}
					data-testid="view-all-proposals"
				>
					View all proposals
					<ChevronRight className="size-3" />
				</Link>
			</CardHeading>
			{query.isLoading ? (
				<SkeletonRows
					rows={3}
					testId="open-proposals-loading"
				/>
			) : query.error && !query.data ? (
				// A failed background refetch keeps the loaded rows.
				<ErrorState
					title="Failed to load proposals"
					error={query.error}
					onRetry={() => query.refetch()}
					testId="open-proposals-error"
				/>
			) : proposals.length === 0 ? (
				<EmptyState
					icon={FileText}
					title="No open proposals"
					description="Proposals waiting for signatures show up here."
					testId="open-proposals-empty"
				/>
			) : (
				<div className={tableShellClass}>
					<table className={tableClass}>
						<thead>
							<tr className={tableShellHeadRowClass}>
								<th className="px-3">Proposal</th>
								<th className="w-20 px-3 sm:w-26">
									Status
								</th>
								<th className="hidden w-32 px-3 sm:table-cell">
									Weight
								</th>
								<th className="w-22 px-3 text-right sm:w-28">
									<span className="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{proposals.map((proposal) => (
								<OpenProposalRow
									key={proposal.id}
									proposal={proposal}
									proposerLabel={
										labels.get(proposal.proposerAddress) ??
										null
									}
									proposedByYou={
										proposal.proposerAddress ===
										currentAddress?.address
									}
								/>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}

function OpenProposalRow({
	proposal,
	proposerLabel,
	proposedByYou,
}: {
	proposal: ProposalCardInput;
	proposerLabel: string | null;
	proposedByYou: boolean;
}) {
	const status = proposalStatusKey(proposal);
	const executing = useExecuteOrVerify();
	return (
		<tr
			className={tableRowClass}
			data-testid="open-proposal"
			data-digest={proposal.digest}
			data-status={status}
		>
			<td className="px-3 py-2.75">
				<div className="flex min-w-0 items-center gap-3">
					{/* The kind of proposal isn't decoded yet, so one icon for all. */}
					<span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground-secondary sm:flex">
						<FileText className="size-4" />
					</span>
					<div className="flex min-w-0 flex-col gap-0.75">
						<span
							className="truncate text-14 font-medium"
							data-testid="open-proposal-title"
						>
							{proposalTitle(proposal)}
						</span>
						<span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-12 text-muted-foreground">
							<span
								className="inline-flex min-w-0 items-center gap-1"
								data-testid="open-proposal-proposer"
							>
								Proposed by{' '}
								{/* The name alone; the address only when unnamed. */}
								<SignerName
									label={proposerLabel}
									address={
										proposerLabel
											? undefined
											: proposal.proposerAddress
									}
									marker={proposedByYou ? 'you' : null}
									markerStyle="parens"
									size="inline"
								/>
							</span>
							<ProposalExpiry
								transactionBytes={proposal.transactionBytes}
								variant="inline"
							/>
						</span>
					</div>
				</div>
			</td>
			<td className="px-3 py-2.75">
				<ProposalStatusChip
					status={status}
					data-testid="proposal-status"
				/>
			</td>
			<td className="hidden px-3 py-2.75 sm:table-cell">
				<ProposalWeight proposal={proposal} />
			</td>
			<td className="px-3 py-2.75 text-right">
				{status === 'ready' && (
					<Button
						size="sm"
						onClick={() => executing.execute(proposal)}
						disabled={executing.isPending}
						data-testid="execute-proposal-button"
					>
						{executing.isPending ? 'Executing…' : 'Execute'}
					</Button>
				)}
			</td>
		</tr>
	);
}
