// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useNetwork } from '@/contexts/NetworkContext';
import { useEpochInfo } from '@/hooks/useEpochInfo';
import {
	PROPOSALS_PAGE_SIZE,
	usePaginatedProposals,
} from '@/hooks/usePaginatedProposals';
import {
	isProposalExpired,
	proposalsPath,
	toProposalCardInput,
} from '@/lib/proposalUtils';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ProposalsTable } from '../proposals/ProposalsTable';
import { buttonVariants } from '../ui/button';
import { CardHeading } from '../ui/card';

/** The overview lists this many open proposals; the rest are on the proposals tab. */
const OPEN_PROPOSALS_SHOWN = 5;

/**
 * The account's open proposals as a table: what each proposes and when it
 * expires, where it stands, its signature weight, and Execute once it has
 * enough. Links to the proposals tab for the full list.
 */
export function OpenProposals({
	multisig,
}: {
	multisig: MultisigWithMembersForPublicKey;
}) {
	const { network } = useNetwork();
	const epochQuery = useEpochInfo();
	const epochInfo = epochQuery.data;
	const query = usePaginatedProposals({
		multisigAddress: multisig.address,
		network,
		status: ProposalStatus.PENDING,
		// The proposals tab's page size, so both share one cached query.
		perPage: PROPOSALS_PAGE_SIZE,
	});
	// An expired proposal is still pending but can't execute any more, so
	// it isn't open; the proposals tab lists it under Expired.
	const proposals = useMemo(
		() =>
			(query.data?.pages[0]?.data ?? [])
				.filter(
					(proposal) =>
						!isProposalExpired(proposal, epochInfo),
				)
				.slice(0, OPEN_PROPOSALS_SHOWN)
				.map((proposal) =>
					toProposalCardInput(proposal, multisig),
				),
		[query.data, epochInfo, multisig],
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
					to={proposalsPath(multisig.address)}
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
			<ProposalsTable
				multisig={multisig}
				proposals={proposals}
				variant="overview"
				// Expired proposals aren't open, which takes the epoch to
				// tell; if it fails to load, none count as expired.
				loading={query.isLoading || epochQuery.isLoading}
				// A failed background refetch keeps the loaded rows.
				error={query.data ? null : query.error}
				onRetry={() => query.refetch()}
				empty={{
					title: 'No open proposals',
					description:
						'Proposals waiting for signatures show up here.',
				}}
				testId="open-proposals"
			/>
		</section>
	);
}
