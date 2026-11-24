// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import type { Account } from '@mysten/sagat/v1';
import { Transaction } from '@mysten/sui/transactions';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { readNodeFacts } from '@/hooks/useAliasSets';
import { checkNewProposal } from '@/lib/new-proposal';
import {
	checkSignerOnNetwork,
	shownActingSets,
} from '@/lib/proposal-integrity';
import {
	SignersRefusedError,
	SignersUncheckedError,
} from '@/lib/signers-refused';
import { toast } from '@/lib/toast';
import {
	namedChain,
	readTransactionBytes,
} from '@/lib/transaction-preview';
import { SignatureDeclinedError } from '@/lib/wallet-session';

import { useNetwork } from '../contexts/NetworkContext';
import { apiClient } from '../lib/api';
import { MutationKeys, QueryKeys } from '../lib/queryKeys';

/** The bytes aren't sent from the pod or another address pays their gas. Nothing was signed. */
export class BytesNotFromPodError extends Error {
	constructor() {
		super(content.newProposal.bytesNotFromPod);
		this.name = 'BytesNotFromPodError';
	}
}

/** The bytes name a chain other than the node's. Nothing was signed. */
export class ChainMismatchError extends Error {
	constructor() {
		super(content.common.wrongChain);
		this.name = 'ChainMismatchError';
	}
}

interface CreateProposalParams {
	multisig: Pick<Account, 'address' | 'signerSets'>;
	transactionData: string;
	description?: string;
}

export function useCreateProposal() {
	const { network } = useNetwork();
	const currentAccount = useCurrentAccount();
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const { currentAddress } = useApiAuth();
	// Only while the wallet is signing; the mutation goes on to save.
	const [awaitingWallet, setAwaitingWallet] =
		useState(false);

	const mutation = useMutation({
		mutationKey: [MutationKeys.CreateProposal],
		mutationFn: async ({
			multisig,
			transactionData,
			description,
		}: CreateProposalParams) => {
			if (!currentAddress || !currentAccount) {
				throw new Error(content.errors.noConnectedAccount);
			}

			// Refused before the wallet opens, so no signature leaves it.
			const refused = checkNewProposal(
				multisig,
				transactionData,
				currentAccount.address,
			);
			if (refused === 'bytes')
				throw new BytesNotFromPodError();
			if (refused)
				throw new SignersRefusedError(refused, network);

			const node = await readNodeFacts(
				queryClient,
				dappKit.getClient(network),
				network,
				multisig.address,
			);
			const onNetwork = checkSignerOnNetwork({
				shown: shownActingSets(multisig),
				signerAddress: currentAccount.address,
				namedChain: namedChain(
					readTransactionBytes(transactionData).transaction,
				),
				node,
			});
			if (onNetwork === 'chain')
				throw new ChainMismatchError();
			if (onNetwork === 'unchecked')
				throw new SignersUncheckedError(network);
			if (onNetwork)
				throw new SignersRefusedError(onNetwork, network);

			// Parse transaction data
			const transaction = Transaction.from(transactionData);

			// The wallet builds and signs it. Anything thrown here comes from
			// the wallet, so nothing has been sent yet.
			let signatureResult;
			setAwaitingWallet(true);
			try {
				signatureResult = await dappKit.signTransaction({
					transaction,
					account: currentAccount,
				});
			} catch (cause) {
				throw new SignatureDeclinedError(cause);
			} finally {
				setAwaitingWallet(false);
			}

			// Create proposal via API
			return apiClient.createProposal({
				multisigAddress: multisig.address,
				transactionBytes: transactionData,
				signature: signatureResult.signature as string,
				description,
				network,
			});
		},
		onSuccess: () => {
			// Invalidate all proposal-related queries
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			toast.success(content.toasts.proposalCreated);
		},
	});

	return { ...mutation, awaitingWallet };
}
