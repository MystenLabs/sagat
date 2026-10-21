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
import { toast } from 'sonner';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

export function useRemoveProposer(
	accountAddress: string,
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
				throw new Error('No wallet connected');
			}

			const expiry = defaultExpiry();
			const message =
				PersonalMessages.removeAccountProposer(
					proposerAddress,
					accountAddress,
					expiry,
				);

			const { signature } =
				await dappKit.signPersonalMessage({
					message: new TextEncoder().encode(message),
				});

			return apiClient.removeAccountProposer(
				accountAddress,
				proposerAddress,
				signature,
				expiry,
			);
		},
		onSuccess: () => {
			// Invalidate the multisig query to refetch with updated proposers
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisig, accountAddress],
			});
			toast.success('Proposer removed successfully');
			options?.onSuccess?.();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: 'Failed to remove proposer',
			);
		},
	});
}
