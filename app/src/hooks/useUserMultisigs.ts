// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';

import {
	getKeyMembership,
	getOriginalSignerSet,
} from '@/lib/signerSets';
import { type AccountForPublicKey } from '@/lib/types';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

// The accounts the connected key has accepted to sign for.
export function useUserMultisigs() {
	const { isCurrentAddressAuthenticated, currentAddress } =
		useApiAuth();

	return useQuery({
		queryKey: [
			QueryKeys.Multisigs,
			QueryKeys.User,
			currentAddress,
		],
		queryFn: async (): Promise<AccountForPublicKey[]> => {
			if (!currentAddress)
				throw new Error('No wallet connected');

			// Lists the accounts of every key in the session, so keep the
			// ones where the connected key has accepted.
			const accounts = await apiClient.getAccounts();

			return accounts.flatMap((account) => {
				// The screens show the original signer set; an account whose
				// key sits only in another set needs the rotation screens.
				const signerSet = getOriginalSignerSet(account);
				if (!signerSet) return [];
				const membership = getKeyMembership(
					signerSet,
					currentAddress.publicKey,
				);
				if (!membership?.isAccepted) return [];
				return [{ ...account, ...membership, signerSet }];
			});
		},
		enabled: isCurrentAddressAuthenticated,
		staleTime: 1000 * 30, // 30 seconds
		refetchInterval: 1000 * 60, // Refetch every minute
	});
}
