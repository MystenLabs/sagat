// Copyright (c) Mysten Labs, Inc.
// Modifications Copyright (c) 2025 IOTA Stiftung
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useSignTransaction,
} from '@iota/dapp-kit';
import { Transaction } from '@iota/iota-sdk/transactions';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

interface SignProposalParams {
	proposalId: number;
	transactionBytes: string;
}

export function useSignProposal() {
	const currentAccount = useCurrentAccount();
	const queryClient = useQueryClient();
	const { mutateAsync: signTransaction } =
		useSignTransaction();

	return useMutation({
		mutationFn: async ({
			proposalId,
			transactionBytes,
		}: SignProposalParams) => {
			if (!currentAccount)
				throw new Error('No connected account');

			// Create transaction from built bytes for signing
			const transaction = Transaction.from(
				transactionBytes,
			);

			// Sign the transaction
			const result = await signTransaction({
				transaction,
				account: currentAccount,
			});

			// Call API to vote on the proposal
			return apiClient.voteForProposal(proposalId, {
				signature: result.signature as string,
			});
		},
		onSuccess: () => {
			// Invalidate all proposal-related queries
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposal],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			toast.success('Proposal signed successfully!');
		},
	});
}
