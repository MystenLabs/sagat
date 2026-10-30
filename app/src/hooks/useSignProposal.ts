// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';

import { signatureAddedMessage } from '@/lib/proposalUtils';
import { toast } from '@/lib/toast';
import { type ProposalCardInput } from '@/lib/types';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

type SignProposalParams = Pick<
	ProposalCardInput,
	'id' | 'transactionBytes' | 'totalWeight'
>;

/**
 * Signs a proposal's transaction with the wallet and adds the signature.
 * Resolves with the vote's tally and the signature itself, so a caller
 * can execute at once without waiting for the proposal to refetch.
 */
export function useSignProposal() {
	const currentAccount = useCurrentAccount();
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();

	return useMutation({
		mutationFn: async ({
			id: proposalId,
			transactionBytes,
		}: SignProposalParams) => {
			if (!currentAccount)
				throw new Error('No connected account');

			// Create transaction from built bytes for signing
			const transaction = Transaction.from(
				transactionBytes,
			);

			// Sign the transaction
			const result = await dappKit.signTransaction({
				transaction,
			});
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
			toast.error("Couldn't sign the proposal", {
				description: error.message,
			});
		},
	});
}
