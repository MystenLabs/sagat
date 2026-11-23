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
import { useNetwork } from '@/contexts/NetworkContext';
import { toast } from '@/lib/toast';

import { apiV1Client } from '../lib/api';
import { MutationKeys, QueryKeys } from '../lib/queryKeys';

export function useAddProposer(
	multisigAddress: string,
	options?: {
		onSuccess?: () => void;
	},
) {
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const currentAccount = useCurrentAccount();
	const { network } = useNetwork();

	return useMutation({
		mutationKey: [MutationKeys.AddProposer],
		mutationFn: async (proposerAddress: string) => {
			if (!currentAccount?.address) {
				throw new Error(content.errors.noWalletConnected);
			}

			// Canonical, as the API and the signed message name it.
			const account = normalizeSuiAddress(multisigAddress);
			const expiry = defaultExpiry();
			const message = PersonalMessages.addMultisigProposer(
				proposerAddress,
				account,
				expiry,
			);

			const { signature } =
				await dappKit.signPersonalMessage({
					message: new TextEncoder().encode(message),
				});

			return apiV1Client.addAccountProposer(account, {
				network,
				proposer: proposerAddress,
				signature,
				expiry,
			});
		},
		onSuccess: () => {
			// Invalidate the multisig query to refetch with new proposers
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisig, multisigAddress],
			});
			toast.success(content.toasts.proposerAdded);
			options?.onSuccess?.();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: content.toasts.proposerAddFailed,
			);
		},
	});
}
