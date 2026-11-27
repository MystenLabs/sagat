// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';

import { content } from '@/content';
import { readNodeFacts } from '@/hooks/useAliasSets';
import { proposalProposerQuery } from '@/hooks/useProposerProofs';
import { signerChangeIn } from '@/lib/change-signers';
import { type SuiNetwork } from '@/lib/network';
import {
	checkProposalIntegrity,
	checkSignerOnNetwork,
	type AppProposal,
	type ShownPod,
} from '@/lib/proposal-integrity';
import {
	shownSignerSet,
	signatureAddedMessage,
	toProposalCardInput,
} from '@/lib/proposalUtils';
import {
	signersUncheckedLine,
	signRefusedLine,
} from '@/lib/signers-refused';
import { toast } from '@/lib/toast';
import {
	namedChain,
	readTransactionBytes,
} from '@/lib/transaction-preview';

import { apiV1Client } from '../lib/api';
import { MutationKeys, QueryKeys } from '../lib/queryKeys';
import { writeProposal } from './useGetProposal';

interface SignProposalParams {
	proposal: AppProposal;
	/** The pod from the app's own account read; null from the proposal's link. */
	pod: ShownPod | null;
	/** The digest the viewer opened, from the page's URL. */
	openedDigest: string;
}

/**
 * Signs a proposal's transaction with the wallet and adds the signature,
 * refusing bytes that fail `checkProposalIntegrity`, a wallet no acting
 * set on the proposal's network holds (nor a new set of the signer change
 * the bytes make), bytes naming another chain, or an invalid proposer,
 * before the wallet sees them. Resolves with the
 * proposal the vote returned, counted against the sets the node read
 * passed.
 */
export function useSignProposal() {
	const currentAccount = useCurrentAccount();
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	// Only while the wallet is signing; the mutation goes on to save.
	const [awaitingWallet, setAwaitingWallet] =
		useState(false);

	const mutation = useMutation({
		mutationKey: [MutationKeys.SignProposal],
		mutationFn: async ({
			proposal,
			pod,
			openedDigest,
		}: SignProposalParams) => {
			if (!currentAccount)
				throw new Error(content.errors.noConnectedAccount);
			const { digest, transactionBytes } = proposal;
			const network = proposal.network as SuiNetwork;

			const node = await readNodeFacts(
				queryClient,
				dappKit.getClient(network),
				network,
				pod?.address ?? proposal.accountAddress,
			);
			// Only from the bytes, checked against the node's alias set.
			const newSets =
				(node.aliases.kind === 'read' &&
					signerChangeIn(
						transactionBytes,
						node.aliases.aliases,
					)?.newSets) ||
				[];

			const failure = checkProposalIntegrity(proposal, {
				pod,
				openedDigest,
				signerAddress: currentAccount.address,
				newSets,
			});
			// A new signer's place comes from the alias read; without it, unchecked.
			if (
				failure === 'notSigner' &&
				node.aliases.kind !== 'read'
			)
				throw new Error(signersUncheckedLine(network));
			if (failure)
				throw new Error(signRefusedLine(failure, network));

			const onNetwork = checkSignerOnNetwork({
				shown: proposal.signerSets,
				signerAddress: currentAccount.address,
				namedChain: namedChain(
					readTransactionBytes(transactionBytes)
						.transaction,
				),
				node,
				newSets,
			});
			if (onNetwork === 'unchecked')
				throw new Error(signersUncheckedLine(network));
			if (onNetwork)
				throw new Error(
					signRefusedLine(onNetwork, network),
				);

			if (
				(await queryClient.fetchQuery(
					proposalProposerQuery(proposal, node.aliases),
				)) === 'invalid'
			)
				throw new Error(
					signRefusedLine('proposer', network),
				);

			// Create transaction from built bytes for signing
			const transaction = Transaction.from(
				transactionBytes,
			);

			// Sign the transaction
			let result;
			setAwaitingWallet(true);
			try {
				result = await dappKit.signTransaction({
					transaction,
					// The account the check passed, so another can't sign.
					account: currentAccount,
				});
			} finally {
				setAwaitingWallet(false);
			}
			const signature = result.signature as string;

			const voted = await apiV1Client.voteForProposal(
				digest,
				{ signature },
			);
			return {
				voted,
				counted: toProposalCardInput(
					voted,
					node.aliases,
					currentAccount.address,
				),
			};
		},
		onSuccess: async ({ voted, counted }) => {
			await writeProposal(queryClient, voted);
			toast.success(
				signatureAddedMessage(
					shownSignerSet(counted.checkedSignerSets),
				),
			);
		},
		onError: (error: Error) => {
			// The wallet declined, or the API refused the vote because the
			// proposal changed meanwhile: refetch, so the page catches up.
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposal],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			toast.error(content.toasts.proposalSignFailed, {
				description: error.message,
			});
		},
	});

	return { ...mutation, awaitingWallet };
}
