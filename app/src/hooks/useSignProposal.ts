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
import { extractPublicKeyFromBase64 } from '@/lib/wallet';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

type SignProposalParams = Pick<
	ProposalCardInput,
	| 'id'
	| 'transactionBytes'
	| 'currentWeight'
	| 'totalWeight'
	| 'multisig'
>;

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

			// Call API to vote on the proposal
			return apiClient.voteForProposal(proposalId, {
				signature: result.signature as string,
			});
		},
		onSuccess: ({ hasReachedThreshold }, proposal) => {
			// Invalidate all proposal-related queries
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposal],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			const signerWeight =
				proposal.multisig.members.find(
					(member) =>
						extractPublicKeyFromBase64(
							member.publicKey,
						).toSuiAddress() === currentAccount?.address,
				)?.weight ?? 0;
			toast.success(
				hasReachedThreshold
					? 'Signature added'
					: signatureAddedMessage(proposal, signerWeight),
			);
		},
	});
}
