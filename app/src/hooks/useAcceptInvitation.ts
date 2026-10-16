// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { PersonalMessages } from '@mysten/sagat';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { toast } from '@/lib/toast';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

export function useAcceptInvitation() {
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const { currentAddress } = useApiAuth();

	return useMutation({
		mutationFn: async ({
			address: multisigAddress,
		}: {
			address: string;
			name?: string | null;
		}) => {
			if (!currentAddress)
				throw new Error('No wallet connected');

			// Create and sign the message
			const result = await dappKit.signPersonalMessage({
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
		onSuccess: (_data, { name }) => {
			// Invalidate queries to refresh multisig data
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Invitations],
			});
			toast.success(
				name
					? `You've joined ${name}`
					: 'Invitation accepted',
			);
		},
		onError: (error: Error) => {
			toast.error("Couldn't accept the invitation", {
				description: error.message,
			});
		},
	});
}
