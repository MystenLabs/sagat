// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { PersonalMessages } from '@mysten/sagat';
import { type Proposal } from '@mysten/sagat/v1';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { toast } from '@/lib/toast';

import { apiV1Client } from '../lib/api';
import { MutationKeys } from '../lib/queryKeys';
import { writeProposal } from './useGetProposal';

export function useCancelProposal() {
	const queryClient = useQueryClient();
	const currentAccount = useCurrentAccount();
	const dappKit = useDAppKit();
	const { currentAddress } = useApiAuth();

	return useMutation({
		mutationKey: [MutationKeys.CancelProposal],
		mutationFn: async (
			proposal: Pick<Proposal, 'digest' | 'accountAddress'>,
		) => {
			if (!currentAccount || !currentAddress)
				throw new Error(content.errors.noWalletConnected);

			// Create a message to sign for cancellation
			const message = PersonalMessages.cancelProposal(
				proposal.digest,
				proposal.accountAddress,
			);

			// Sign the message
			const signResult = await dappKit.signPersonalMessage({
				message: new TextEncoder().encode(message),
			});

			// Call API to cancel the proposal
			return apiV1Client.cancelProposal(proposal.digest, {
				signature: signResult.signature,
			});
		},
		onSuccess: (cancelled) => {
			void writeProposal(queryClient, cancelled);
			toast.success(content.toasts.proposalCancelled);
		},
		onError: (error: Error) => {
			toast.error(
				content.toasts.proposalCancelFailed(error.message),
			);
		},
	});
}
