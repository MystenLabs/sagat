// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { type CreateMultisigRequest } from '@mysten/sagat';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { type ArrivalState } from '@/hooks/useArrivalBanner';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

/**
 * Creates the multisig and lands on its overview, which greets the
 * creator with who was invited. Failures stay with the caller: the wizard
 * shows them in place, with no toast.
 */
export function useCreateMultisig() {
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const navigate = useNavigate();
	// Read live rather than from this render: the wizard may have unmounted.
	const currentAccountAddress = () =>
		dappKit.stores.$connection.get().account?.address;

	return useMutation({
		mutationFn: ({
			request,
		}: {
			request: CreateMultisigRequest;
			/** What the greeting calls the other signers. */
			invited: string[];
		}) => apiClient.createMultisig(request),
		// Note who is creating, and where, so a late response doesn't pull
		// the user away after they switched accounts or left the page.
		onMutate: () => ({
			account: currentAccountAddress(),
			path: window.location.pathname,
		}),
		onSuccess: (multisig, { invited }, started) => {
			void queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			const stillHere =
				currentAccountAddress() === started.account &&
				window.location.pathname === started.path;
			if (!stillHere) return;
			navigate(`/multisig/${multisig.address}/overview`, {
				state: {
					created: { invited },
				} satisfies ArrivalState,
			});
		},
	});
}
