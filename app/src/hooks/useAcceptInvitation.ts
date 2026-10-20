// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { PersonalMessages } from '@mysten/sagat';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { useApiAuth } from '@/contexts/ApiAuthContext';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

export function useAcceptInvitation() {
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const navigate = useNavigate();
	const { currentAddress } = useApiAuth();
	// Read live rather than from this render: the card may have unmounted.
	const currentAccountAddress = () =>
		dappKit.stores.$connection.get().account?.address;

	return useMutation({
		mutationFn: async ({
			address: multisigAddress,
		}: {
			address: string;
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
		// Note who is accepting, and where, so a late response doesn't pull
		// the user away after they switched accounts or left the page.
		onMutate: () => ({
			account: currentAccountAddress(),
			path: window.location.pathname,
		}),
		// Lives here rather than in the caller: the invitation card unmounts
		// as soon as the inbox refetches, which drops per-call callbacks.
		// The accept has landed, so go to the account right away; the
		// account page waits for the refreshed list instead of blocking
		// the button on it.
		onSuccess: (_data, { address }, started) => {
			void queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			void queryClient.invalidateQueries({
				queryKey: [QueryKeys.Invitations],
			});
			const stillHere =
				currentAccountAddress() === started.account &&
				window.location.pathname === started.path;
			if (!stillHere) return;
			navigate(`/multisig/${address}/overview`, {
				state: { joined: true },
			});
		},
		// The accept may have landed even though the response was lost, so
		// refresh rather than assume nothing changed.
		onError: () => {
			void queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			void queryClient.invalidateQueries({
				queryKey: [QueryKeys.Invitations],
			});
		},
	});
}
