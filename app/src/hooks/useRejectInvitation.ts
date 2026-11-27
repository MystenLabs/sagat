// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import {
	defaultExpiry,
	PersonalMessages,
} from '@mysten/sagat';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { MutationKeys, QueryKeys } from '@/lib/queryKeys';
import { toast } from '@/lib/toast';

import { apiV1Client } from '../lib/api';

export function useRejectInvitation() {
	const currentAccount = useCurrentAccount();
	const queryClient = useQueryClient();
	const { currentAddress } = useApiAuth();
	const dappKit = useDAppKit();
	const { network } = useNetwork();

	return useMutation({
		mutationKey: [MutationKeys.RejectInvitation],
		mutationFn: async ({
			address,
		}: {
			address: string;
		}) => {
			if (!currentAccount || !currentAddress) {
				throw new Error(content.errors.noWalletConnected);
			}

			// Canonical, as the API and the signed message name it.
			const multisigAddress = normalizeSuiAddress(address);
			const expiry = defaultExpiry();
			const message =
				PersonalMessages.rejectAccountInvitation(
					multisigAddress,
					expiry,
				);
			const result = await dappKit.signPersonalMessage({
				message: new TextEncoder().encode(message),
			});

			return apiV1Client.rejectAccountInvite(
				multisigAddress,
				{ network, signature: result.signature, expiry },
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
