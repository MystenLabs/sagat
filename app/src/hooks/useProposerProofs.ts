// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type PublicProposal } from '@mysten/sagat';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { rebuildAccount } from '@/lib/proposal-integrity';
import {
	checkProposalProposer,
	verifyProposers,
	type ProposerProofAccount,
} from '@/lib/proposer-proofs';
import { QueryKeys } from '@/lib/queryKeys';

/**
 * Each proposer's proof by address, undefined while checking or until
 * `enabled`; `trusted` is false when the signers don't make up the account.
 */
export function useProposerProofs(
	account: ProposerProofAccount,
	{ enabled }: { enabled: boolean },
) {
	const trusted = useMemo(
		() => rebuildAccount(account, account.address) !== null,
		[account],
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

/** The proposal's `ProposerCheck`; `pending` until it resolves. */
export function useProposalProposerCheck(
	proposal: PublicProposal,
	{ enabled }: { enabled: boolean },
) {
	const { data } = useQuery({
		...proposalProposerQuery(proposal),
		enabled,
	});
	return {
		check: data ?? null,
		pending: data === undefined,
	};
}
