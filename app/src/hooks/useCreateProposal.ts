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

import { content } from '@/content';
import { useApiAuth } from '@/contexts/ApiAuthContext';
import { toast } from '@/lib/toast';

import { useNetwork } from '../contexts/NetworkContext';
import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

/** The wallet didn't sign: declined, closed or failed. Nothing was created. */
export class SignatureDeclinedError extends Error {
	/** What the wallet threw. */
	readonly cause: unknown;

	constructor(cause: unknown) {
		super('The wallet didn’t sign the proposal.');
		this.name = 'SignatureDeclinedError';
		this.cause = cause;
	}
}

interface CreateProposalParams {
	multisigAddress: string;
	transactionData: string;
	description?: string;
}

export function useCreateProposal() {
	const { network } = useNetwork();
	const currentAccount = useCurrentAccount();
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();
	const { currentAddress } = useApiAuth();

	return useMutation({
		mutationFn: async ({
			multisigAddress,
			transactionData,
			description,
		}: CreateProposalParams) => {
			if (!currentAddress || !currentAccount) {
				throw new Error('No connected account');
			}

			// Parse transaction data
			const transaction = Transaction.from(transactionData);

			// The wallet builds and signs it. Anything thrown here comes from
			// the wallet, so nothing has been sent yet.
			let signatureResult;
			try {
				signatureResult = await dappKit.signTransaction({
					transaction,
				});
			} catch (cause) {
				throw new SignatureDeclinedError(cause);
			}

			// Create proposal via API
			return apiClient.createProposal({
				multisigAddress,
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
}
