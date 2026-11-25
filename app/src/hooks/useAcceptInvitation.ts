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
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { readPodAliasSet } from '@/hooks/useAliasSets';
import { type ArrivalState } from '@/hooks/useArrivalBanner';
import {
	checkPodSigners,
	podActing,
	shownActingSets,
} from '@/lib/proposal-integrity';
import {
	SignersRefusedError,
	SignersUncheckedError,
} from '@/lib/signers-refused';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { apiV1Client } from '../lib/api';
import { MutationKeys, QueryKeys } from '../lib/queryKeys';

export function useAcceptInvitation() {
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const navigate = useNavigate();
	const currentAccount = useCurrentAccount();
	const { currentAddress } = useApiAuth();
	const { network } = useNetwork();
	// Read live rather than from this render: the card may have unmounted.
	const currentAccountAddress = () =>
		dappKit.stores.$connection.get().account?.address;
	// The same refresh whether the accept landed or its response was lost.
	const refreshAfterAccept = () => {
		void queryClient.invalidateQueries({
			queryKey: [QueryKeys.Multisigs],
		});
		void queryClient.invalidateQueries({
			queryKey: [QueryKeys.Invitations],
		});
	};

	return useMutation({
		mutationKey: [MutationKeys.AcceptInvitation],
		meta: {
			expected: (error) =>
				error instanceof SignersRefusedError ||
				error instanceof SignersUncheckedError,
		},
		mutationFn: async ({
			multisig,
		}: {
			multisig: MultisigWithMembersForPublicKey;
		}) => {
			if (!currentAddress || !currentAccount)
				throw new Error(content.errors.noWalletConnected);
			// Canonical, as the API and the signed message name it.
			const multisigAddress = normalizeSuiAddress(
				multisig.address,
			);

			// Both signers checks pass, on an alias set read now, before the wallet opens.
			const signers = checkPodSigners(
				multisig,
				currentAccount.address,
			);
			if (signers.kind !== 'ok')
				throw new SignersRefusedError(
					signers.kind,
					network,
				);
			const acting = podActing(
				shownActingSets(multisig),
				await readPodAliasSet(
					queryClient,
					dappKit.getClient(network),
					network,
					multisigAddress,
				),
				currentAccount.address,
			);
			if (acting.state === 'refused')
				throw new SignersRefusedError('notActing', network);
			if (acting.state !== 'ok')
				throw new SignersUncheckedError(network);

			const expiry = defaultExpiry();
			const result = await dappKit.signPersonalMessage({
				message: new TextEncoder().encode(
					PersonalMessages.acceptAccountInvitation(
						multisigAddress,
						expiry,
					),
				),
				// The account the check passed, so another can't sign.
				account: currentAccount,
			});

			return apiV1Client.acceptAccountInvite(
				multisigAddress,
				{ network, signature: result.signature, expiry },
			);
		},
		// Note who is accepting, and where, so a late response doesn't pull
		// the user away after they switched accounts or left the page.
		onMutate: () => ({
			account: currentAccountAddress(),
			path: window.location.pathname,
		}),
		// Lives here rather than in the caller: the invitation card unmounts
		// as soon as the inbox refetches, which drops per-call callbacks.
		// The accept has landed, so go to the account right away; the
		// account page waits for the refreshed list instead of blocking
		// the button on it.
		onSuccess: (_data, { multisig }, started) => {
			refreshAfterAccept();
			const stillHere =
				currentAccountAddress() === started.account &&
				window.location.pathname === started.path;
			if (!stillHere) return;
			navigate(`/multisig/${multisig.address}/overview`, {
				state: { joined: true } satisfies ArrivalState,
			});
		},
		// The accept may have landed even though the response was lost, so
		// refresh rather than assume nothing changed.
		onError: refreshAfterAccept,
	});
}
