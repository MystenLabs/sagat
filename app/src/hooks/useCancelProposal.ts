// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import {
	PersonalMessages,
	type Proposal,
} from '@mysten/sagat';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { toast } from '@/lib/toast';

import { apiClient } from '../lib/api';
import { MutationKeys, QueryKeys } from '../lib/queryKeys';

export function useCancelProposal() {
	const queryClient = useQueryClient();
	const currentAccount = useCurrentAccount();
	const dappKit = useDAppKit();
	const { currentAddress } = useApiAuth();

	return useMutation({
		mutationKey: [MutationKeys.CancelProposal],
		mutationFn: async (
			proposal: Pick<
				Proposal,
				'id' | 'digest' | 'multisigAddress'
			>,
		) => {
			if (!currentAccount || !currentAddress)
				throw new Error(content.errors.noWalletConnected);

			// Create a message to sign for cancellation
			const message = PersonalMessages.cancelProposal(
				proposal.digest,
				proposal.multisigAddress,
			);

			// Sign the message
			const signResult = await dappKit.signPersonalMessage({
				message: new TextEncoder().encode(message),
			});

			// Call API to cancel the proposal
			return apiClient.cancelProposal(proposal.id, {
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
