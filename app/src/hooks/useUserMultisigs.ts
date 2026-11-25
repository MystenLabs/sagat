// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type RemovedAccount } from '@mysten/sagat/v1';
import { useQuery } from '@tanstack/react-query';

import { content } from '@/content';
import { accountName } from '@/lib/account-name';
import { CONFIG } from '@/lib/constants';
import { formatShortDateTime } from '@/lib/dates';
import { removalsSeenKey } from '@/lib/localStorageKeys';
import {
	networkLabel,
	type SuiNetwork,
} from '@/lib/network';
import { toast } from '@/lib/toast';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import {
	noLongerSignerOf,
	removalsToTell,
	rowsAnswered,
} from '@/lib/user-multisig';
import { getExplorerUrl } from '@/lib/utils';

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
		queryFn: async (): Promise<{
			rows: MultisigWithMembersForPublicKey[];
			noLongerSigner: string[];
		}> => {
			if (!currentAddress)
				throw new Error(content.errors.noWalletConnected);

			// Every key of the session's pods; this key's are the ones it accepted.
			const list = await apiV1Client.getAccounts(network);
			noticeRemovals(list.removed, currentAddress, network);
			return {
				rows: rowsAnswered(
					list.accounts,
					currentAddress,
					'accepted',
				),
				noLongerSigner: noLongerSignerOf(
					list,
					currentAddress.publicKey,
				),
			};
		},
		enabled: isCurrentAddressAuthenticated,
		staleTime: 1000 * 30, // 30 seconds
		refetchInterval: CONFIG.REFETCH_INTERVAL,
	});

	return {
		...query,
		data: useRowsActing(query.data?.rows),
		/** Pods this key was a signer of and no longer is. */
		noLongerSigner: query.data?.noLongerSigner,
	};
}

/** A notice, once per wallet and network, for the latest signer change that removed the wallet from each pod. */
function noticeRemovals(
	removed: RemovedAccount[],
	wallet: { address: string; publicKey: string },
	network: SuiNetwork,
) {
	const key = removalsSeenKey(wallet.address, network);
	try {
		const seen = Number(localStorage.getItem(key) ?? -1);
		const fresh = removalsToTell(
			removed,
			wallet.publicKey,
			seen,
		);
		if (fresh.length === 0) return;
		localStorage.setItem(
			key,
			String(Math.max(...fresh.map((pod) => pod.eventId))),
		);
		for (const pod of fresh) {
			const href = getExplorerUrl(
				pod.transactionDigest!,
				network,
			);
			toast.info(
				content.toasts.removedFromPod(
					accountName(pod),
					networkLabel(network),
					formatShortDateTime(pod.removedAt) ?? '',
				),
				{
					link: href
						? {
								label:
									content.common.actions.viewOnExplorer,
								href,
							}
						: undefined,
				},
			);
		}
	} catch {
		// Without storage, no notice rather than one on every read.
	}
}
