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
import { toast } from 'sonner';

import { useApiAuth } from '@/contexts/ApiAuthContext';

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
				throw new Error('No wallet connected');

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
			toast.success('Proposal cancelled successfully');
		},
		onError: (error: Error) => {
			toast.error(
				`Failed to cancel proposal: ${error.message}`,
			);
		},
	});
}
