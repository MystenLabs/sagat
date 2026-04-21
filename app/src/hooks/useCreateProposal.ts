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
	const dappKit = useDAppKit();
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

			// `transactionData` may be either base64 BCS bytes or a
			// serialized JSON `Transaction`. The wallet resolves and
			// builds its own bytes when signing; we ship those exact
			// bytes (`signatureResult.bytes`) to the API so the stored
			// `transactionBytes` is always canonical base64 BCS,
			// regardless of how the caller crafted the input.
			const transaction = Transaction.from(transactionData);

			const signatureResult = await dappKit.signTransaction(
				{
					transaction,
				},
			);

			return apiClient.createProposal({
				multisigAddress,
				transactionBytes: signatureResult.bytes,
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
