// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type PublicProposal } from '@mysten/sagat';
import {
	keepPreviousData,
	useQuery,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import {
	checkProposalProposer,
	trustsSigners,
	verifyProposers,
	type ProposerProofAccount,
} from '@/lib/proposer-proofs';
import { QueryKeys } from '@/lib/queryKeys';

/**
 * Each proposer's proof by address, undefined while checking or until
 * `enabled`; `trusted` is false unless `account` is `openedAddress` and its
 * signers make it up.
 */
export function useProposerProofs(
	account: ProposerProofAccount,
	{
		enabled,
		openedAddress,
	}: { enabled: boolean; openedAddress: string },
) {
	const trusted = useMemo(
		() => trustsSigners(account, openedAddress),
		[account, openedAddress],
	);
	const { data } = useQuery({
		queryKey: [
			QueryKeys.ProposerProofs,
			openedAddress,
			account.address,
			account.threshold,
			account.members,
			account.proposers,
		],
		queryFn: () => verifyProposers(account, openedAddress),
		enabled,
		staleTime: Infinity,
	});
	return { proofs: enabled ? data : undefined, trusted };
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
			proposal.signatures,
			proposal.events,
		],
		queryFn: () => checkProposalProposer(proposal),
		staleTime: Infinity,
	};
}

/**
 * The proposal's `ProposerCheck`, kept from the previous proposal while a
 * new one is checked; `pending` until the current one resolves.
 */
export function useProposalProposerCheck(
	proposal: PublicProposal,
	{ enabled }: { enabled: boolean },
) {
	const { data, isPlaceholderData } = useQuery({
		...proposalProposerQuery(proposal),
		enabled,
		placeholderData: keepPreviousData,
	});
	return {
		check: data ?? null,
		pending: data === undefined || isPlaceholderData,
	};
}
