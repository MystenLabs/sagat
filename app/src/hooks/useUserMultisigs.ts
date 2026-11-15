// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';

import { content } from '@/content';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { toUserMultisig } from '@/lib/user-multisig';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

// Hook to fetch user's accepted multisigs from the /addresses/connections endpoint
export function useUserMultisigs() {
	const { isCurrentAddressAuthenticated, currentAddress } =
		useApiAuth();

	return useQuery({
		queryKey: [
			QueryKeys.Multisigs,
			QueryKeys.User,
			currentAddress,
		],
		queryFn: async (): Promise<
			MultisigWithMembersForPublicKey[]
		> => {
			if (!currentAddress)
				throw new Error(content.errors.noWalletConnected);

			// Get accepted multisig connections grouped by public key
			const connections =
				await apiClient.getMultisigConnections();

			return (
				connections[currentAddress.publicKey] || []
			).map((m) => toUserMultisig(m, currentAddress));
		},
		enabled: isCurrentAddressAuthenticated,
		staleTime: 1000 * 30, // 30 seconds
		refetchInterval: 1000 * 60, // Refetch every minute
	});
}
