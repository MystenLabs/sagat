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
import { QueryKeys } from '@/lib/queryKeys';
import { toast } from '@/lib/toast';

import { apiClient } from '../lib/api';

export function useRejectInvitation() {
	const currentAccount = useCurrentAccount();
	const queryClient = useQueryClient();
	const { currentAddress } = useApiAuth();
	const dappKit = useDAppKit();

	return useMutation({
		mutationFn: async ({
			address: multisigAddress,
		}: {
			address: string;
		}) => {
			if (!currentAccount || !currentAddress) {
				throw new Error(content.errors.noWalletConnected);
			}

			// Sign rejection message
			const message =
				PersonalMessages.rejectMultisigInvitation(
					multisigAddress,
				);
			const result = await dappKit.signPersonalMessage({
				message: new TextEncoder().encode(message),
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
			toast.success(content.toasts.invitationRejected);
			// Invalidate the multisig queries to refresh the list
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Invitations],
			});
		},
		// The invitation may have been handled elsewhere (another tab), so
		// refresh the list rather than assume it's still pending.
		onError: () => {
			void queryClient.invalidateQueries({
				queryKey: [QueryKeys.Invitations],
			});
		},
	});
}
