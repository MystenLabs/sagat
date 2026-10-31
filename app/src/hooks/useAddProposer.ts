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
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';

import { content } from '@/content';
import { toast } from '@/lib/toast';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

export function useAddProposer(
	multisigAddress: string,
	options?: {
		onSuccess?: () => void;
	},
) {
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const currentAccount = useCurrentAccount();

	return useMutation({
		mutationFn: async (proposerAddress: string) => {
			if (!currentAccount?.address) {
				throw new Error(content.errors.noWalletConnected);
			}

			const expiry = defaultExpiry();
			const message = PersonalMessages.addMultisigProposer(
				proposerAddress,
				multisigAddress,
				expiry,
			);

			const { signature } =
				await dappKit.signPersonalMessage({
					message: new TextEncoder().encode(message),
				});

			return apiClient.addMultisigProposer(
				multisigAddress,
				proposerAddress,
				signature,
				expiry,
			);
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
