// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';

import {
	verifyProposers,
	type ProposerProofAccount,
} from '@/lib/proposer-proofs';
import { QueryKeys } from '@/lib/queryKeys';

/**
 * Each proposer's proof, keyed by address; undefined while checking, or
 * when the account came without its proposers' events.
 */
export function useProposerProofs(
	account: ProposerProofAccount,
) {
	// The account list leaves `event` out; only the account itself has it.
	const hasEvents = account.proposers.every(
		(proposer) => proposer.event !== undefined,
	);
	const { data } = useQuery({
		queryKey: [
			QueryKeys.ProposerProofs,
			account.address,
			account.threshold,
			account.members,
			account.proposers,
		],
		queryFn: () => verifyProposers(account),
		enabled: hasEvents,
		staleTime: Infinity,
	});
	return hasEvents ? data : undefined;
}
