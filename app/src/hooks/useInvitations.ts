// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';

import { getKeyMembership } from '@/lib/signerSets';
import { type InvitationForPublicKey } from '@/lib/types';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

// Hook to fetch invitations for the current user's public key
export function useInvitations(
	showRejected = false,
	enabled = true,
) {
	const { isCurrentAddressAuthenticated, currentAddress } =
		useApiAuth();

	return useQuery({
		queryKey: [
			QueryKeys.Invitations,
			currentAddress?.address,
			showRejected,
		],
		queryFn: async (): Promise<
			InvitationForPublicKey[]
		> => {
			if (!currentAddress) {
				throw new Error('No wallet connected');
			}

			const invitations = await apiClient.getInvitations(
				currentAddress.publicKey,
				{ showRejected },
			);

			// Every listed set has the key as a member.
			return invitations.flatMap((signerSet) => {
				const membership = getKeyMembership(
					signerSet,
					currentAddress.publicKey,
				);
				return membership
					? [{ ...signerSet, ...membership }]
					: [];
			});
		},
		enabled:
			isCurrentAddressAuthenticated &&
			!!currentAddress &&
			enabled,
		staleTime: 0, // Don't cache - always refetch when needed
		refetchOnMount: true, // Refetch when component mounts
	});
}
