// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit';
import { formatAddress } from '@mysten/sui/utils';
import { CheckCircle, Clock, X } from 'lucide-react';
import { useEffect } from 'react';

import { type ProposalCardInput } from '@/lib/types';
import { extractPublicKeyFromBase64 } from '@/lib/wallet';

import { useDryRun } from '../../hooks/useDryRun';
import { useSignProposal } from '../../hooks/useSignProposal';
import { EffectsPreview } from '../preview-effects/EffectsPreview';
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
	const dryRunMutation = useDryRun();
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
			!dryRunMutation.data &&
			!dryRunMutation.error
		) {
			dryRunMutation.mutate(proposal.transactionBytes);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [proposal.transactionBytes]);

	const handleSignProposal = () => {
		signProposalMutation.mutate({
			proposalId: proposal.id,
			transactionBytes: proposal.transactionBytes,
		});
	};

	const isDryRunSuccessful =
		dryRunMutation.data?.effects?.status?.status ===
		'success';

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h5 className="font-medium text-gray-900">
					Transaction Preview
				</h5>
				<div className="flex items-center gap-2">
					{isDryRunSuccessful && (
						<>
							{userHasSigned ? (
								<div className="flex items-center gap-1 text-sm text-green-600">
									<CheckCircle className="w-4 h-4" />
									Already Signed
								</div>
							) : isMember ? (
								<Button
									size="sm"
									onClick={handleSignProposal}
									disabled={signProposalMutation.isPending}
									className="bg-green-600 hover:bg-green-700"
								>
									{signProposalMutation.isPending
										? 'Signing...'
										: 'Sign Proposal'}
								</Button>
							) : (
								<div className="flex items-center gap-1 text-sm text-gray-600">
									<Clock className="w-4 h-4" />
									Cannot sign:{' '}
									{formatAddress(
										currentWallet?.address || '',
									)}{' '}
									is not a member of the multisig
								</div>
							)}
						</>
					)}
					{onCancel &&
						!userHasSigned &&
						!proposal.isPublic && (
							<Button
								size="sm"
								variant="outlineDestructive"
								onClick={onCancel}
								disabled={isCancelling}
							>
								<X className="w-4 h-4 mr-1" />
								{isCancelling ? 'Cancelling...' : 'Cancel'}
							</Button>
						)}
				</div>
			</div>

			{dryRunMutation.isPending && (
				<div className="flex items-center gap-2 text-sm text-gray-500">
					<div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
					Loading preview...
				</div>
			)}

			{dryRunMutation.data && (
				<div
					className={`border rounded-lg p-3 ${
						isDryRunSuccessful
							? 'border-green-200 bg-white'
							: 'border-red-200 bg-white'
					}`}
				>
					<EffectsPreview
						output={dryRunMutation.data}
						bytes={proposal.transactionBytes}
					/>
				</div>
			)}

			{dryRunMutation.error && (
				<div className="border border-red-200 bg-white rounded-lg p-3">
					<p className="text-sm text-red-600">
						{dryRunMutation.error.message ||
							'Transaction would fail on-chain'}
					</p>
				</div>
			)}

			{/* Sign Proposal Error */}
			{signProposalMutation.error && (
				<div className="border border-red-200 bg-red-50 rounded-lg p-3">
					<h6 className="font-medium text-red-800 mb-1">
						Failed to Sign Proposal
					</h6>
					<p className="text-sm text-red-600">
						{signProposalMutation.error.message}
					</p>
				</div>
			)}

			{/* Proposal description */}
			{proposal.description && (
				<div className="border border-gray-200 bg-white rounded-lg p-3">
					<p className="text-sm text-gray-600">
						{proposal.description}
					</p>
				</div>
			)}
		</div>
	);
}
