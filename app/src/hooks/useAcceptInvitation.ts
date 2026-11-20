// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { PersonalMessages } from '@mysten/sagat';
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
	checkAccountSigners,
	podActing,
	shownActingSets,
} from '@/lib/proposal-integrity';
import {
	SignersRefusedError,
	SignersUncheckedError,
} from '@/lib/signers-refused';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { apiClient } from '../lib/api';
import { MutationKeys, QueryKeys } from '../lib/queryKeys';

export function useAcceptInvitation() {
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const navigate = useNavigate();
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
			if (!currentAddress)
				throw new Error(content.errors.noWalletConnected);
			const multisigAddress = multisig.address;

			// Both signers checks pass, on an alias set read now, before the wallet opens.
			const signers = checkAccountSigners(multisig, {
				account: multisigAddress,
				signerAddress: currentAddress.address,
			});
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
			);
			if (acting.state === 'refused')
				throw new SignersRefusedError('notActing', network);
			if (acting.state !== 'ok')
				throw new SignersUncheckedError(network);

			// Create and sign the message
			const result = await dappKit.signPersonalMessage({
				message: new TextEncoder().encode(
					PersonalMessages.acceptMultisigInvitation(
						multisigAddress,
					),
				),
			});

			// Call API to accept the invitation
			return apiClient.acceptMultisigInvite(
				multisigAddress,
				{
					signature: result.signature,
				},
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
