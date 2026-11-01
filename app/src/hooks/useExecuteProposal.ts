// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import {
	ProposalStatus,
	type PublicProposal,
} from '@mysten/sagat';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { fromBase64 } from '@mysten/sui/utils';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';

import { content } from '@/content';
import { toast } from '@/lib/toast';
import { getExplorerUrl, safeDecode } from '@/lib/utils';
import { extractPublicKeyFromBase64 } from '@/lib/wallet';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';
import { useVerifyProposal } from './useVerifyProposal';

const TOASTS = content.toasts;

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
				throw new Error(
					content.proposal.execute.notPending,
				);

			try {
				// Order the members.
				const multisigMembers = [
					...proposal.multisig.members,
				].sort((a, b) => a.order - b.order);
				// Step 1: Reconstruct the MultiSigPublicKey
				const publicKeys = multisigMembers.map(
					(member) => ({
						publicKey: extractPublicKeyFromBase64(
							member.publicKey,
						),
						weight: member.weight,
					}),
				);

				const multiSigPublicKey =
					MultiSigPublicKey.fromPublicKeys({
						threshold: proposal.multisig.threshold,
						publicKeys,
					});

				// Step 2: Map signatures to the correct order based on the multisig public key order
				// The signatures need to be in the same order as the public keys in the multisig
				const orderedSignatures: string[] = [];
				for (const member of multisigMembers) {
					const signature = proposal.signatures.find(
						(sig) => sig.publicKey === member.publicKey,
					);
					if (signature) {
						orderedSignatures.push(signature.signature);
					}
				}

				const combinedSignature =
					multiSigPublicKey.combinePartialSignatures(
						orderedSignatures,
					);

				// Step 3: Execute the transaction with the combined signature
				const result = await suiClient.executeTransaction({
					transaction: fromBase64(
						proposal.transactionBytes,
					),
					signatures: [combinedSignature],
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

				// Step 4: Call the verify endpoint to update proposal status in the backend
				const verifyResponse =
					await apiClient.verifyProposalByDigest(
						proposal.digest,
					);

				return {
					executionResult:
						result.Transaction || result.FailedTransaction,
					verifyResponse,
				};
			} catch (error) {
				throw error;
			}
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
			// Execution changes on-chain balances and objects; refresh the
			// multisig's assets, every objects page and filter included.
			const { network, multisig } = variables.proposal;
			for (const key of [
				QueryKeys.Balances,
				QueryKeys.OwnedObjects,
			])
				queryClient.invalidateQueries({
					queryKey: [key, network, multisig.address],
				});
			const digest = data.executionResult.digest;
			const explorerUrl = getExplorerUrl(
				digest,
				variables.proposal.network,
			);
			const link = (label: string) =>
				explorerUrl
					? { label, href: explorerUrl }
					: undefined;
			// The node can land the transaction and still fail it.
			const { status } = data.executionResult;
			if (!status.success) {
				toast.error(TOASTS.proposalExecuteFailed, {
					description:
						safeDecode(status.error.message) ||
						content.common.states.failedOnChain,
					link: link(TOASTS.seeDetails),
				});
				return;
			}
			toast.success(TOASTS.proposalExecuted, {
				description: digest,
				link: link(content.common.actions.viewOnExplorer),
			});
		},
		onError: (error: Error) => {
			toast.error(TOASTS.proposalExecuteFailed, {
				description: error.message,
			});
		},
	});
}

/**
 * Executes a proposal from a button. When execution fails, checks the
 * proposal with the API in case someone else executed it meanwhile.
 */
export function useExecuteOrVerify() {
	const execute = useExecuteProposal();
	const verify = useVerifyProposal();
	return {
		execute: (
			proposal: PublicProposal,
			options?: { onError?: () => void },
		) =>
			execute.mutate(
				{ proposal },
				{
					onError: () => {
						verify.mutate(proposal.digest);
						options?.onError?.();
					},
				},
			),
		isPending: execute.isPending,
		error: execute.error,
	};
}
