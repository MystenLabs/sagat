// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { formatAddress } from '@mysten/sui/utils';
import { Check, Clock, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { simulationProps } from '@/components/transaction-preview/simulation';
import { TransactionPreview } from '@/components/transaction-preview/TransactionPreview';
import { type ProposalCardInput } from '@/lib/types';
import { safeDecode } from '@/lib/utils';
import { extractPublicKeyFromBase64 } from '@/lib/wallet';

import { useSignProposal } from '../../hooks/useSignProposal';
import { useTransactionPreview } from '../../hooks/useTransactionPreview';
import { IntentSummary } from '../preview-effects/IntentSummary';
import { Button } from '../ui/button';

interface ProposalPreviewProps {
	proposal: ProposalCardInput;
	userHasSigned: boolean;
	onCancel?: () => void;
	isCancelling?: boolean;
}

export function ProposalPreview({
	proposal,
	userHasSigned,
	onCancel,
	isCancelling,
}: ProposalPreviewProps) {
	const { dryRun, analysis, preview } =
		useTransactionPreview();
	const signProposalMutation = useSignProposal();
	const currentWallet = useCurrentAccount();

	const isMember = proposal.multisig.members.some(
		(member) =>
			extractPublicKeyFromBase64(
				member.publicKey,
			).toSuiAddress() === currentWallet?.address,
	);

	// Automatically run dry run when component mounts
	useEffect(() => {
		if (
			proposal.transactionBytes &&
			!dryRun.data &&
			!dryRun.error
		) {
			preview(proposal.transactionBytes);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [proposal.transactionBytes]);

	const handleSignProposal = () => {
		signProposalMutation.mutate({
			proposalId: proposal.id,
			transactionBytes: proposal.transactionBytes,
		});
	};

	const simulation = simulationProps(dryRun);
	const isDryRunSuccessful =
		simulation?.status === 'passed';
	const accounts = useMemo(
		() => [
			{
				address: proposal.multisig.address,
				name: proposal.multisig.name ?? null,
			},
		],
		[proposal.multisig.address, proposal.multisig.name],
	);

	const actions = (
		<>
			{isDryRunSuccessful &&
				(userHasSigned ? (
					<div
						className="flex items-center gap-1 text-13 text-success-foreground"
						data-testid="proposal-already-signed"
					>
						<Check strokeWidth={3} className="size-4" />
						Already signed
					</div>
				) : isMember ? (
					<Button
						size="sm"
						onClick={handleSignProposal}
						disabled={signProposalMutation.isPending}
						variant="default"
						data-testid="sign-proposal-button"
					>
						{signProposalMutation.isPending
							? 'Signing…'
							: 'Sign proposal'}
					</Button>
				) : (
					<div
						className="flex items-center gap-1 text-13 text-muted-foreground"
						data-testid="preview-cannot-sign"
					>
						<Clock className="size-4" />
						Cannot sign:{' '}
						{formatAddress(currentWallet?.address || '')} is
						not a member of the multisig
					</div>
				))}
			{onCancel && !userHasSigned && !proposal.isPublic && (
				<Button
					size="sm"
					variant="outlineDestructive"
					onClick={onCancel}
					disabled={isCancelling}
				>
					<X className="size-4" />
					{isCancelling ? 'Cancelling…' : 'Cancel'}
				</Button>
			)}
		</>
	);

	const settled =
		!!simulation && simulation.status !== 'pending';

	const analyzer = (
		<IntentSummary
			analysis={analysis.data}
			isLoading={analysis.isPending}
			error={analysis.error}
		/>
	);
	const analyzerCount =
		(analysis.data?.issues.length ?? 0) +
		(analysis.error ? 1 : 0);

	return (
		<div className="flex flex-col gap-3">
			{simulation ? (
				settled ? (
					<div
						data-testid="transaction-preview-result"
						data-result={
							isDryRunSuccessful ? 'success' : 'failure'
						}
					>
						<TransactionPreview
							bytes={proposal.transactionBytes}
							accounts={accounts}
							actions={actions}
							analyzer={analyzer}
							analyzerCount={analyzerCount}
							{...simulation}
						/>
					</div>
				) : (
					<TransactionPreview
						bytes={proposal.transactionBytes}
						accounts={accounts}
						actions={actions}
						analyzer={analyzer}
						analyzerCount={analyzerCount}
						{...simulation}
					/>
				)
			) : (
				<>
					{analyzer}
					<div className="flex items-center justify-between gap-3">
						<h3 className="text-15 font-medium">
							Transaction preview
						</h3>
						<div className="flex flex-wrap items-center gap-2">
							{actions}
						</div>
					</div>
					<p
						className="rounded-lg border border-error-border bg-card p-3 text-13 text-error-foreground"
						data-testid="transaction-preview-unreachable"
					>
						{safeDecode(
							dryRun.error?.message ||
								'The transaction could not be simulated.',
						)}
					</p>
				</>
			)}

			{/* Sign Proposal Error */}
			{signProposalMutation.error && (
				<div className="border border-error-border bg-error rounded-lg p-3">
					<h6 className="font-medium text-error-foreground mb-1">
						Failed to Sign Proposal
					</h6>
					<p className="text-sm text-error-foreground">
						{signProposalMutation.error.message}
					</p>
				</div>
			)}

			{/* Proposal description */}
			{proposal.description && (
				<div className="border border-border bg-card rounded-lg p-3">
					<p className="text-sm text-muted-foreground">
						{proposal.description}
					</p>
				</div>
			)}
		</div>
	);
}
