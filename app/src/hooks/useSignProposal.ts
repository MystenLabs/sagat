// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { type PublicProposal } from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';

import { content } from '@/content';
import {
	checkProposalIntegrity,
	type IntegrityProposal,
} from '@/lib/proposal-integrity';
import { signatureAddedMessage } from '@/lib/proposalUtils';
import { toast } from '@/lib/toast';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

type SignProposalParams = IntegrityProposal &
	Pick<PublicProposal, 'id' | 'totalWeight'> & {
		/** The digest the viewer opened, from the page's URL. */
		openedDigest: string;
	};

/**
 * Signs a proposal's transaction with the wallet and adds the signature,
 * refusing bytes that fail `checkProposalIntegrity` before the wallet
 * sees them. Resolves with the vote's tally and the signature itself, so a caller
 * can execute at once without waiting for the proposal to refetch.
 */
export function useSignProposal() {
	const currentAccount = useCurrentAccount();
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	// Only while the wallet is signing; the mutation goes on to save.
	const [awaitingWallet, setAwaitingWallet] =
		useState(false);

	const mutation = useMutation({
		mutationFn: async (proposal: SignProposalParams) => {
			if (!currentAccount)
				throw new Error(content.errors.noConnectedAccount);
			const { id: proposalId, transactionBytes } = proposal;

			const failure = checkProposalIntegrity(proposal, {
				openedDigest: proposal.openedDigest,
				signerAddress: currentAccount.address,
			});
			if (failure)
				throw new Error(
					content.proposal.approvals.refused[failure],
				);

			// Create transaction from built bytes for signing
			const transaction = Transaction.from(
				transactionBytes,
			);

			// Sign the transaction
			let result;
			setAwaitingWallet(true);
			try {
				result = await dappKit.signTransaction({
					transaction,
					// The account the check passed, so another can't sign.
					account: currentAccount,
				});
			} finally {
				setAwaitingWallet(false);
			}
			const signature = result.signature as string;

			// Call API to vote on the proposal
			const vote = await apiClient.voteForProposal(
				proposalId,
				{ signature },
			);
			return { vote, signature };
		},
		onSuccess: ({ vote }, proposal) => {
			// Invalidate all proposal-related queries
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposal],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			toast.success(
				signatureAddedMessage(vote, proposal.totalWeight),
			);
		},
		onError: (error: Error) => {
			// The wallet declined, or the API refused the vote because the
			// proposal changed meanwhile: refetch, so the page catches up.
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposal],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			toast.error(content.toasts.proposalSignFailed, {
				description: error.message,
			});
		},
	});

	return { ...mutation, awaitingWallet };
}
