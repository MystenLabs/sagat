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

/** The pods the signed-in key accepted, on the selected network. */
export function useUserMultisigs() {
	const { isCurrentAddressAuthenticated, currentAddress } =
		useApiAuth();
	const { network } = useNetwork();

	const query = useQuery({
		queryKey: [
			QueryKeys.Multisigs,
			QueryKeys.User,
			network,
			currentAddress,
		],
		queryFn: async (): Promise<
			MultisigWithMembersForPublicKey[]
		> => {
			if (!currentAddress)
				throw new Error(content.errors.noWalletConnected);

			// Every key of the session's pods; this key's are the ones it accepted.
			const { accounts } =
				await apiV1Client.getAccounts(network);
			return rowsAnswered(
				accounts,
				currentAddress,
				'accepted',
			);
		},
		enabled: isCurrentAddressAuthenticated,
		staleTime: 1000 * 30, // 30 seconds
		refetchInterval: CONFIG.REFETCH_INTERVAL,
	});

	return { ...query, data: useRowsActing(query.data) };
}
