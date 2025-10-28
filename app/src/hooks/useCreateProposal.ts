// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useSignTransaction,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiAuth } from '@/contexts/ApiAuthContext';

import { useNetwork } from '../contexts/NetworkContext';
import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

interface CreateProposalParams {
	multisigAddress: string;
	transactionData: string;
	description?: string;
}

export function useCreateProposal() {
	const { network } = useNetwork();
	const currentAccount = useCurrentAccount();
	const queryClient = useQueryClient();
	const { mutateAsync: signTransaction } =
		useSignTransaction();
	const { currentAddress } = useApiAuth();

	return useMutation({
		mutationFn: async ({
			multisigAddress,
			transactionData,
			description,
		}: CreateProposalParams) => {
			if (!currentAddress || !currentAccount) {
				throw new Error('No connected account');
			}

			// Parse transaction data
			const transaction = Transaction.from(transactionData);

			// Sign the transaction (it will build and sign automatically)
			const signatureResult = await signTransaction({
				transaction,
				account: currentAccount,
			});

			// Create proposal via API
			return apiClient.createProposal({
				multisigAddress,
				transactionBytes: transactionData,
				signature: signatureResult.signature as string,
				description,
				network,
			});
		},
		onSuccess: () => {
			// Invalidate all proposal-related queries
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			toast.success('Proposal created successfully!');
		},
	});
}
