// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useSignPersonalMessage } from '@mysten/dapp-kit';
import { PersonalMessages } from '@mysten/sagat';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiAuth } from '@/contexts/ApiAuthContext';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

export function useAcceptInvitation() {
	const queryClient = useQueryClient();
	const { mutateAsync: signPersonalMessage } =
		useSignPersonalMessage();
	const { currentAddress } = useApiAuth();

	return useMutation({
		mutationFn: async (multisigAddress: string) => {
			if (!currentAddress)
				throw new Error('No wallet connected');

			// Create and sign the message
			const result = await signPersonalMessage({
				message: new TextEncoder().encode(
					PersonalMessages.acceptMultisigInvitation(
						multisigAddress,
					),
				),
			});

			// Call API to accept the invitation
			return apiClient.acceptMultisigInvite(
				multisigAddress,
				{
					signature: result.signature,
				},
			);
		},
		onSuccess: () => {
			// Invalidate queries to refresh multisig data
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Invitations],
			});
			toast.success('Invitation accepted successfully!');
		},
		onError: (error: Error) => {
			toast.error(
				`Failed to accept invitation: ${error.message}`,
			);
		},
	});
}
