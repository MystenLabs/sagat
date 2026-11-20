// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type PublicProposal } from '@mysten/sagat';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
	keepPreviousData,
	useQuery,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import { type AliasRead } from '@/lib/alias-set';
import {
	checkProposalProposer,
	proposerProofMembers,
	verifyProposers,
	type ProposerProofAccount,
} from '@/lib/proposer-proofs';
import { QueryKeys } from '@/lib/queryKeys';

import { useAliasSets } from './useAliasSets';

/**
 * Each proposer's proof by address, undefined while checking or until
 * `enabled`; `trusted` is false unless `account` is `openedAddress`, its
 * signers make it up, and a shown set acts on the selected network.
 */
export function useProposerProofs(
	account: ProposerProofAccount,
	{
		enabled,
		openedAddress,
	}: { enabled: boolean; openedAddress: string },
) {
	const { aliases: reads } = useAliasSets(
		[account.address],
		{
			enabled,
		},
	);
	const aliases = reads?.get(
		normalizeSuiAddress(account.address),
	);
	const trusted = useMemo(
		() =>
			aliases !== undefined &&
			proposerProofMembers(
				account,
				openedAddress,
				aliases,
			) !== null,
		[account, openedAddress, aliases],
	);
	const { data } = useQuery({
		queryKey: [
			QueryKeys.ProposerProofs,
			openedAddress,
			account.address,
			account.threshold,
			account.members,
			account.proposers,
			aliases,
		],
		queryFn: () =>
			verifyProposers(account, openedAddress, aliases!),
		enabled: enabled && aliases !== undefined,
		staleTime: Infinity,
	});
	return { proofs: enabled ? data : undefined, trusted };
}

/** `checkProposalProposer` as a query, shared by the page and Sign; `aliases` is the pod's alias set on the proposal's network. */
export function proposalProposerQuery(
	proposal: PublicProposal,
	aliases: AliasRead,
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
			aliases,
		],
		queryFn: () => checkProposalProposer(proposal, aliases),
		staleTime: Infinity,
	};
}

/**
 * The proposal's `ProposerCheck`, kept from the previous proposal while a
 * new one is checked; `pending` until the current one resolves, and
 * while `aliases` is still being read.
 */
export function useProposalProposerCheck(
	proposal: PublicProposal,
	{
		enabled,
		aliases,
	}: { enabled: boolean; aliases: AliasRead | undefined },
) {
	const { data, isPlaceholderData } = useQuery({
		...proposalProposerQuery(
			proposal,
			aliases ?? { kind: 'failed' },
		),
		enabled: enabled && aliases !== undefined,
		placeholderData: keepPreviousData,
	});
	return {
		check: data ?? null,
		pending: data === undefined || isPlaceholderData,
	};
}
