// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { PersonalMessages } from '@mysten/sagat';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { toast } from '@/lib/toast';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

export function useCancelProposal() {
	const queryClient = useQueryClient();
	const currentAccount = useCurrentAccount();
	const dappKit = useDAppKit();
	const { currentAddress } = useApiAuth();

	return useMutation({
		mutationFn: async (proposalId: number) => {
			if (!currentAccount || !currentAddress)
				throw new Error(content.errors.noWalletConnected);

			// Create a message to sign for cancellation
			const message =
				PersonalMessages.cancelProposal(proposalId);

			// Sign the message
			const signResult = await dappKit.signPersonalMessage({
				message: new TextEncoder().encode(message),
			});

			// Call API to cancel the proposal
			return apiClient.cancelProposal(proposalId, {
				signature: signResult.signature,
			});
		},
		onSuccess: () => {
			// Invalidate all proposal-related queries
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposal],
			});
			toast.success(content.toasts.proposalCancelled);
		},
		onError: (error: Error) => {
			toast.error(
				content.toasts.proposalCancelFailed(error.message),
			);
		},
	});
}
