// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

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
	const navigate = useNavigate();

	return useMutation({
		mutationFn: ({
			request,
		}: {
			request: CreateMultisigRequest;
			/** What the greeting calls the other signers. */
			invited: string[];
		}) => apiClient.createMultisig(request),
		onSuccess: (multisig, { invited }) => {
			void queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			navigate(`/multisig/${multisig.address}/overview`, {
				state: {
					created: { invited },
				} satisfies ArrivalState,
			});
		},
	});
}
