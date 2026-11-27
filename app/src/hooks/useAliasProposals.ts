// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from 'react';

import { useNetwork } from '@/contexts/NetworkContext';
import { useEpochInfo } from '@/hooks/useEpochInfo';
import {
	PROPOSALS_PAGE_SIZE,
	usePaginatedProposals,
} from '@/hooks/usePaginatedProposals';
import {
	aliasCallsIn,
	isProposalExpired,
} from '@/lib/proposalUtils';

/**
 * The pod's pending, unexpired proposals that call the alias module, undefined
 * until the list loads, and whether the read failed with no list to show.
 */
export function useAliasProposals(multisigAddress: string) {
	const { network } = useNetwork();
	const { data: epochInfo } = useEpochInfo();
	// The query Overview and Proposals share, so it's usually cached.
	const { data: pending, isError } = usePaginatedProposals({
		multisigAddress,
		network,
		status: 'PENDING',
		perPage: PROPOSALS_PAGE_SIZE,
	});
	const proposals = useMemo(
		() =>
			pending?.pages
				.flatMap((page) => page.proposals)
				.filter(
					(proposal) =>
						!isProposalExpired(proposal, epochInfo) &&
						aliasCallsIn(proposal.transactionBytes).length >
							0,
				),
		[pending, epochInfo],
	);
	return { proposals, failed: isError && !pending };
}
