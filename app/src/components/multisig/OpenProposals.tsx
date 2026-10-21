// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';
import { ChevronRight, FileText } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useExecuteOrVerify } from '@/hooks/useExecuteProposal';
import { usePaginatedProposals } from '@/hooks/usePaginatedProposals';
import {
	proposalStatusKey,
	proposalTitle,
	toProposalCardInput,
} from '@/lib/proposalUtils';
import { signerRows } from '@/lib/signers';
import {
	type MultisigWithMembersForPublicKey,
	type ProposalCardInput,
} from '@/lib/types';

import { ProposalExpiry } from '../proposals/ProposalExpiry';
import { ProposalStatusChip } from '../proposals/ProposalStatusChip';
import { ProposalWeight } from '../proposals/ProposalWeight';
import { Button, buttonVariants } from '../ui/button';
import { EmptyState, ErrorState } from '../ui/empty-state';
import { SkeletonRows } from '../ui/skeleton';

/** The overview lists this many open proposals; the rest are on the proposals tab. */
export const OPEN_PROPOSALS_SHOWN = 5;

/**
 * The account's open proposals as a table: what each proposes, where it
 * stands, its signature weight, and Execute once it has enough. Links to
 * the proposals tab for the full list.
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
		perPage: OPEN_PROPOSALS_SHOWN,
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
	// Proposers are named like signers: by label, else short address.
	const signers = useMemo(
		() =>
			signerRows(multisig.members, currentAddress?.address),
		[multisig.members, currentAddress?.address],
	);
	const proposerName = (address: string) => {
		const signer = signers.find(
			(s) => s.address === address,
		);
		if (!signer) return formatAddress(address);
		return signer.isYou
			? `${signer.name} (you)`
			: signer.name;
	};

	return (
		<section
			className="flex flex-col gap-3"
			aria-labelledby="open-proposals-title"
			data-testid="open-proposals"
		>
			<div className="flex items-center justify-between gap-2">
				<h2
					id="open-proposals-title"
					className="text-16 font-medium"
				>
					Open proposals
				</h2>
				<Link
					to={`/multisig/${multisig.address}/proposals`}
					className={buttonVariants({
						variant: 'ghost',
						size: 'sm',
					})}
					data-testid="view-all-proposals"
				>
					<ChevronRight />
					View all proposals
				</Link>
			</div>
			<div className="overflow-hidden rounded-xl border bg-card">
				{query.isLoading ? (
					<SkeletonRows
						rows={3}
						header={false}
						className="p-3"
						testId="open-proposals-loading"
					/>
				) : query.error ? (
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
						description="Every proposal has been executed or cancelled."
						testId="open-proposals-empty"
					/>
				) : (
					<table className="w-full table-fixed text-13">
						<thead>
							<tr className="bg-muted text-left text-12 text-muted-foreground [&>th]:py-1.75 [&>th]:font-normal">
								<th className="px-3">Proposal</th>
								<th className="w-20 px-3 sm:w-24">
									Status
								</th>
								<th className="hidden w-18 px-3 sm:table-cell">
									Weight
								</th>
								<th className="w-22 px-3 text-right sm:w-24">
									<span className="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{proposals.map((proposal) => (
								<OpenProposalRow
									key={proposal.id}
									proposal={proposal}
									proposer={proposerName(
										proposal.proposerAddress,
									)}
								/>
							))}
						</tbody>
					</table>
				)}
			</div>
		</section>
	);
}

function OpenProposalRow({
	proposal,
	proposer,
}: {
	proposal: ProposalCardInput;
	proposer: string;
}) {
	const status = proposalStatusKey(proposal);
	const executing = useExecuteOrVerify();
	return (
		<tr
			className="border-b last:border-b-0"
			data-testid="open-proposal"
			data-digest={proposal.digest}
			data-status={status}
		>
			<td className="px-3 py-2.5">
				<div className="flex min-w-0 flex-col gap-0.75">
					<span
						className="truncate text-14 font-medium"
						data-testid="open-proposal-title"
					>
						{proposalTitle(proposal)}
					</span>
					<span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-12 text-muted-foreground">
						<span data-testid="open-proposal-proposer">
							Proposed by {proposer}
						</span>
						<ProposalExpiry
							transactionBytes={proposal.transactionBytes}
						/>
					</span>
				</div>
			</td>
			<td className="px-3 py-2.5">
				<ProposalStatusChip status={status} />
			</td>
			<td className="hidden px-3 py-2.5 sm:table-cell">
				<ProposalWeight proposal={proposal} />
			</td>
			<td className="px-3 py-2.5 text-right">
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
