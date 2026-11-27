// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';

import { content } from '@/content';
import { CONFIG } from '@/lib/constants';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { rowsAnswered } from '@/lib/user-multisig';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { useNetwork } from '../contexts/NetworkContext';
import { apiV1Client } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';
import { useRowsActing } from './useRowsActing';
import { useUserMultisigs } from './useUserMultisigs';

// An address in no accounts is likely waiting on an invitation.
const NO_ACCOUNTS_REFETCH_INTERVAL = 10_000;

/** The signed-in key's invitations on the selected network, or the ones it rejected. */
export function useInvitations(
	showRejected = false,
	{ enabled = true }: { enabled?: boolean } = {},
) {
	const { isCurrentAddressAuthenticated, currentAddress } =
		useApiAuth();
	const { network } = useNetwork();
	const { data: multisigs } = useUserMultisigs();

	const query = useQuery({
		queryKey: [
			QueryKeys.Invitations,
			network,
			currentAddress?.address,
			showRejected,
		],
		queryFn: async (): Promise<
			MultisigWithMembersForPublicKey[]
		> => {
			if (!currentAddress) {
				throw new Error(content.errors.noWalletConnected);
			}

			// Every key of the session's invitations; this key's are its own.
			const { invitations } =
				await apiV1Client.getInvitations(network, {
					showRejected,
				});
			return rowsAnswered(
				invitations,
				currentAddress,
				showRejected ? 'rejected' : 'invited',
			);
		},
		enabled:
			enabled &&
			isCurrentAddressAuthenticated &&
			!!currentAddress,
		staleTime: 0, // Don't cache - always refetch when needed
		refetchOnMount: true, // Refetch when component mounts
		refetchInterval:
			multisigs?.length === 0
				? NO_ACCOUNTS_REFETCH_INTERVAL
				: CONFIG.REFETCH_INTERVAL,
	});

	return { ...query, data: useRowsActing(query.data) };
}
