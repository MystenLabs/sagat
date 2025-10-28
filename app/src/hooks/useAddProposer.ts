// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useSignPersonalMessage,
} from '@mysten/dapp-kit';
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

export function useAddProposer(
	multisigAddress: string,
	options?: {
		onSuccess?: () => void;
	},
) {
	const queryClient = useQueryClient();
	const { mutateAsync: signMessage } =
		useSignPersonalMessage();
	const currentAccount = useCurrentAccount();

	return useMutation({
		mutationFn: async (proposerAddress: string) => {
			if (!currentAccount?.address) {
				throw new Error('No wallet connected');
			}

			const expiry = defaultExpiry();
			const message = PersonalMessages.addMultisigProposer(
				proposerAddress,
				multisigAddress,
				expiry,
			);

			const { signature } = await signMessage({
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
			toast.success('Proposer added successfully');
			options?.onSuccess?.();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: 'Failed to add proposer',
			);
		},
	});
}
