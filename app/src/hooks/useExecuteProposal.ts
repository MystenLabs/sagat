// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import {
	ProposalStatus,
	type PublicProposal,
} from '@mysten/sagat';
import { fromBase64 } from '@mysten/sui/utils';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { combineProposalSignatures } from '@/lib/proposalUtils';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

interface ExecuteProposalParams {
	proposal: PublicProposal;
}

export function useExecuteProposal() {
	const queryClient = useQueryClient();
	const suiClient = useDAppKit().getClient();

	return useMutation({
		mutationFn: async ({
			proposal,
		}: ExecuteProposalParams) => {
			if (proposal.status !== ProposalStatus.PENDING)
				throw new Error('Proposal is not pending');

			// Step 1: Combine the signatures of a signer set that has
			// reached its threshold. The sender stays the account.
			const signature = combineProposalSignatures(proposal);

			// Step 2: Execute the transaction with the combined signature
			const result = await suiClient.executeTransaction({
				transaction: fromBase64(proposal.transactionBytes),
				signatures: [signature],
				include: {
					effects: true,
				},
			});

			await suiClient.waitForTransaction({
				digest:
					result.Transaction?.digest ||
					result.FailedTransaction?.digest ||
					'',
			});

			// Sleep for 500ms to give a bit more time to index.
			await new Promise((resolve) =>
				setTimeout(resolve, 500),
			);

			// Step 3: Call the verify endpoint to update proposal status in the backend
			const verifyResponse =
				await apiClient.verifyProposalByDigest(
					proposal.digest,
				);

			return {
				executionResult:
					result.Transaction || result.FailedTransaction,
				verifyResponse,
			};
		},
		onSuccess: (data, variables) => {
			// Invalidate all proposal-related queries
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			// Remove standalone proposal too
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposal],
			});
			// Execution changes on-chain balances; refresh the multisig asset view.
			queryClient.invalidateQueries({
				queryKey: [
					QueryKeys.Balances,
					variables.proposal.network,
					variables.proposal.accountAddress,
				],
			});
			toast.success(
				`Transaction executed successfully! Digest: ${data.executionResult.digest}`,
			);
		},
		onError: (error: Error) => {
			toast.error(
				`Failed to execute proposal: ${error.message}`,
			);
		},
	});
}
