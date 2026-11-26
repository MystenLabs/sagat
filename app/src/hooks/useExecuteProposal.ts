// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { type Proposal } from '@mysten/sagat/v1';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { fromBase64 } from '@mysten/sui/utils';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';

import { content } from '@/content';
import { readPodAliasSet } from '@/hooks/useAliasSets';
import {
	networkLabel,
	type SuiNetwork,
} from '@/lib/network';
import { signerSetRemoved } from '@/lib/proposal-integrity';
import { type CountedSignerSet } from '@/lib/proposalUtils';
import { toast } from '@/lib/toast';
import { getExplorerUrl, safeDecode } from '@/lib/utils';
import { extractPublicKeyFromBase64 } from '@/lib/wallet';

import { apiV1Client } from '../lib/api';
import { MutationKeys, QueryKeys } from '../lib/queryKeys';
import { writeProposal } from './useGetProposal';
import { useVerifyProposal } from './useVerifyProposal';

const TOASTS = content.toasts;

interface ExecuteProposalParams {
	proposal: Proposal;
	/** The checked signer set that reached its threshold. */
	signerSet: CountedSignerSet;
}

/** The node refused the execution: the set used is no longer in the pod's alias set on the network. */
export class SignersChangedError extends Error {
	constructor(network: SuiNetwork) {
		super(
			TOASTS.proposalSignersChanged(networkLabel(network)),
		);
		this.name = 'SignersChangedError';
	}
}

export function useExecuteProposal() {
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();

	return useMutation({
		mutationKey: [MutationKeys.ExecuteProposal],
		mutationFn: async ({
			proposal,
			signerSet,
		}: ExecuteProposalParams) => {
			if (proposal.status !== 'PENDING')
				throw new Error(
					content.proposal.execute.notPending,
				);

			try {
				// The proposal's network, not whichever one is selected now.
				const network = proposal.network as SuiNetwork;
				const suiClient = dappKit.getClient(network);
				const multisigMembers = [...signerSet.members].sort(
					(a, b) => a.order - b.order,
				);
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
						threshold: signerSet.threshold,
						publicKeys,
					});

				// Step 2: Only the set's members' signatures, in its key order
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
				let result;
				try {
					result = await suiClient.executeTransaction({
						transaction: fromBase64(
							proposal.transactionBytes,
						),
						signatures: [combinedSignature],
						include: {
							effects: true,
						},
					});
				} catch (error) {
					// Whether the set still signs for the pod is the node's alias set to say, not the error's text.
					const aliases = await readPodAliasSet(
						queryClient,
						suiClient,
						network,
						proposal.accountAddress,
					);
					if (signerSetRemoved(signerSet.address, aliases))
						throw new SignersChangedError(network);
					throw error;
				}

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
				const verified =
					await apiV1Client.verifyProposalByDigest(
						proposal.digest,
					);
				await writeProposal(queryClient, verified);

				return {
					executionResult:
						result.Transaction || result.FailedTransaction,
					verified,
				};
			} catch (error) {
				throw error;
			}
		},
		onSuccess: (data, variables) => {
			// Execution changes on-chain balances and objects; refresh the
			// pod's assets, every objects page and filter included.
			const { network, accountAddress } =
				variables.proposal;
			for (const key of [
				QueryKeys.Balances,
				QueryKeys.OwnedObjects,
			])
				queryClient.invalidateQueries({
					queryKey: [key, network, accountAddress],
				});
			// An alias call can change whether the pod has signer changes enabled.
			void queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisig],
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
			if (error instanceof SignersChangedError)
				// The row, Members and the proposal's sets read the pod again.
				for (const key of [
					QueryKeys.Multisigs,
					QueryKeys.Multisig,
					QueryKeys.Proposal,
					QueryKeys.Proposals,
				])
					void queryClient.invalidateQueries({
						queryKey: [key],
					});
			toast.error(TOASTS.proposalExecuteFailed, {
				description: error.message,
			});
		},
	});
}

/**
 * Executes a proposal from a button. When execution fails for any reason
 * but changed signers, checks the proposal with the API in case someone
 * else executed it meanwhile.
 */
export function useExecuteOrVerify() {
	const execute = useExecuteProposal();
	const verify = useVerifyProposal();
	return {
		execute: (
			proposal: Proposal,
			signerSet: CountedSignerSet,
			options?: { onError?: () => void },
		) =>
			execute.mutate(
				{ proposal, signerSet },
				{
					onError: (error) => {
						if (!(error instanceof SignersChangedError))
							verify.mutate(proposal.digest);
						options?.onError?.();
					},
				},
			),
		isPending: execute.isPending,
		error: execute.error,
	};
}
