// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';

import {
	getKeyMembership,
	primarySignerSet,
	validSignerSets,
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
				// Membership in any signer set valid on some network, not
				// only the original one: after a rotation the key may sit in
				// a newer set only. Drafts and retired sets give no access.
				const membership = getKeyMembership(
					validSignerSets(account),
					currentAddress.publicKey,
				);
				// A member of a valid set means one exists.
				const signerSet = primarySignerSet(account);
				if (!membership?.isAccepted || !signerSet)
					return [];
				return [{ ...account, ...membership, signerSet }];
			});
		},
		enabled: isCurrentAddressAuthenticated,
		staleTime: 1000 * 30, // 30 seconds
		refetchInterval: 1000 * 60, // Refetch every minute
	});
}
