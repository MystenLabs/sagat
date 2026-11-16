// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type PublicProposal } from '@mysten/sagat';
import { useQuery } from '@tanstack/react-query';

import { isExternalProposer } from '@/lib/proposalUtils';
import {
	checkProposalProposer,
	verifyProposers,
	type ProposerProofAccount,
} from '@/lib/proposer-proofs';
import { QueryKeys } from '@/lib/queryKeys';

/** Each proposer's proof by address; undefined while checking or without events. */
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

/** `checkProposalProposer` as a query, shared by the page and Sign. */
export function proposalProposerQuery(
	proposal: PublicProposal,
) {
	return {
		queryKey: [
			QueryKeys.ProposerProofs,
			proposal.digest,
			proposal.transactionBytes,
			proposal.proposerAddress,
			proposal.multisigAddress,
			proposal.multisig,
			proposal.events,
		],
		queryFn: () => checkProposalProposer(proposal),
		staleTime: Infinity,
	};
}

/** The proposal's `ProposerCheck`; `pending` until an external proposer's resolves. */
export function useProposalProposerCheck(
	proposal: PublicProposal,
	{ enabled }: { enabled: boolean },
) {
	const external = isExternalProposer(proposal);
	const { data } = useQuery({
		...proposalProposerQuery(proposal),
		enabled: enabled && external,
	});
	if (!external) return { check: null, pending: false };
	return {
		check: data ?? null,
		pending: data === undefined,
	};
}
