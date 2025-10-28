// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useSignPersonalMessage,
} from '@mysten/dapp-kit';
import { PersonalMessages } from '@mysten/sagat';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { QueryKeys } from '@/lib/queryKeys';

import { apiClient } from '../lib/api';

export function useRejectInvitation() {
	const currentAccount = useCurrentAccount();
	const queryClient = useQueryClient();
	const { currentAddress } = useApiAuth();
	const { mutateAsync: signPersonalMessage } =
		useSignPersonalMessage();

	return useMutation({
		mutationFn: async (multisigAddress: string) => {
			if (!currentAccount || !currentAddress) {
				throw new Error('No wallet connected');
			}

			// Sign rejection message
			const message =
				PersonalMessages.rejectMultisigInvitation(
					multisigAddress,
				);
			const result = await signPersonalMessage({
				message: new TextEncoder().encode(message),
				account: currentAccount,
			});

			// Send to API
			return apiClient.rejectMultisigInvite(
				multisigAddress,
				{
					signature: result.signature,
				},
			);
		},
		onSuccess: () => {
			toast.success('Invitation rejected successfully!');
			// Invalidate the multisig queries to refresh the list
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Invitations],
			});
		},
		onError: (error: Error) => {
			toast.error(
				`Failed to reject invitation: ${error.message}`,
			);
		},
	});
}
