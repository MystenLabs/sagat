import {
	ProposalStatus,
	type ProposalWithSignatures,
} from '@mysten/sagat';
import {
	formatAddress,
	formatDigest,
} from '@mysten/sui/utils';
import {
	CheckCircle,
	ChevronDown,
	ChevronRight,
	Clock,
	ExternalLink,
	Eye,
	Rocket,
} from 'lucide-react';
import { useState } from 'react';

import { useApiAuth } from '@/contexts/ApiAuthContext';
import { useGetMultisig } from '@/hooks/useGetMultisig';

import { useNetwork } from '../../contexts/NetworkContext';
import { useCancelProposal } from '../../hooks/useCancelProposal';
import { useExecuteProposal } from '../../hooks/useExecuteProposal';
import { useSignProposal } from '../../hooks/useSignProposal';
import { useVerifyProposal } from '../../hooks/useVerifyProposal';
import {
	calculateCurrentWeight,
	getTotalWeight,
} from '../../lib/proposalUtils';
import { validatePublicKey } from '../../lib/sui-utils';
import { CancelProposalModal } from '../modals/CancelProposalModal';
import { Button } from '../ui/button';
import { CopyButton } from '../ui/copy-button';
import { ProposalPreview } from './ProposalPreview';

interface ProposalCardProps {
	proposal: ProposalWithSignatures;
	defaultExpanded?: boolean;
}

export function ProposalCard({
	proposal,
	defaultExpanded = false,
}: ProposalCardProps) {
	const { network } = useNetwork();
	const isNetworkMismatch = proposal.network !== network;
	const [isExpanded, setIsExpanded] =
		useState(defaultExpanded);
	const [showCancelModal, setShowCancelModal] =
		useState(false);
	const executeProposalMutation = useExecuteProposal();
	const verifyProposalMutation = useVerifyProposal();
	const cancelProposalMutation = useCancelProposal();
	const signProposalMutation = useSignProposal();

	const { data: multisigDetails } = useGetMultisig(
		proposal.multisigAddress,
	);

	// Check if current user has already signed this proposal
	// Check if the proposal is ready to execute
	const isReadyToExecute = () => {
		if (
			!multisigDetails ||
			proposal.status !== ProposalStatus.PENDING
		)
			return false;
		const currentWeight = calculateCurrentWeight(
			proposal,
			multisigDetails,
		);
		const threshold = getTotalWeight(multisigDetails);
		return currentWeight >= threshold;
	};

	const handleExecuteProposal = () => {
		if (!multisigDetails) return;
		executeProposalMutation.mutate(
			{
				proposal,
				multisigDetails,
			},
			{
				onError: () => {
					// If execution fails, try to verify (it might have been executed by someone else)
					verifyProposalMutation.mutate(proposal.id);
				},
			},
		);
	};

	const handleConfirmCancel = () => {
		cancelProposalMutation.mutate(proposal.id, {
			onSuccess: () => {
				setShowCancelModal(false);
			},
		});
	};

	const { currentAddress } = useApiAuth();

	const userHasSigned = () => {
		if (!currentAddress) return false;
		return proposal.signatures.some(
			(sig) => sig.publicKey === currentAddress.publicKey,
		);
	};

	const getProposalTitle = () => {
		// Use description if available, otherwise use a truncated digest
		if (proposal.description?.trim()) {
			const length = proposal.description.trim().length;
			return `${proposal.description.trim().slice(0, 50)}${length > 50 ? '...' : ''}`;
		}
		return `Transaction ${formatDigest(proposal.digest)}`;
	};

	const getStatusBadge = () => {
		if (proposal.status === ProposalStatus.SUCCESS) {
			return (
				<span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
					Executed
				</span>
			);
		}
		if (proposal.status === ProposalStatus.CANCELLED) {
			return (
				<span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
					Cancelled
				</span>
			);
		}
		if (proposal.status === ProposalStatus.FAILURE) {
			return (
				<span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
					Failed
				</span>
			);
		}

		// Pending - check if ready to execute using the proper helpers
		const currentWeight = calculateCurrentWeight(
			proposal,
			multisigDetails,
		);
		const totalWeight = getTotalWeight(multisigDetails);
		if (currentWeight >= totalWeight) {
			return (
				<span className="px-2 py-1 text-xs rounded-full shrink-0 bg-blue-100 text-blue-800">
					Ready to Execute
				</span>
			);
		}
		return (
			<span className="px-2 py-1 text-xs rounded-full shrink-0 bg-orange-100 text-orange-800">
				Pending
			</span>
		);
	};

	const getExplorerUrl = (digest: string) => {
		return network === 'testnet'
			? `https://suiscan.xyz/testnet/tx/${digest}`
			: `https://suiscan.xyz/mainnet/tx/${digest}`;
	};

	const isExternalProposer = () => {
		if (!multisigDetails) return false;

		// Check if proposer address is NOT a member by comparing addresses
		// Members are stored as public keys, need to derive addresses
		const memberAddresses = multisigDetails.members
			.map((member) => {
				try {
					// Derive address from public key
					const { address } = validatePublicKey(
						member.publicKey,
					);
					return address;
				} catch {
					return null;
				}
			})
			.filter(Boolean);

		// Proposer is external if their address is NOT in member addresses
		return !memberAddresses.includes(
			proposal.proposerAddress,
		);
	};

	const getSignatureStatus = () => {
		if (proposal.status !== ProposalStatus.PENDING)
			return null;

		if (userHasSigned()) {
			return (
				<div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full shrink-0">
					<CheckCircle className="w-3 h-3" />
					Already Signed
				</div>
			);
		}

		return (
			<div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full shrink-0">
				<Clock className="w-3 h-3" />
				Pending Signature
			</div>
		);
	};

	return (
		<div className="bg-white border rounded-lg hover:shadow-sm transition-shadow">
			{/* Main proposal row */}
			<div className="flex items-start justify-between p-4 max-md:flex-col max-md:gap-3">
				<div className="flex-1">
					<div className="flex max-md:flex-wrap items-center gap-2 mb-2">
						<h4 className="font-medium text-gray-900 line-clamp-1">
							{getProposalTitle()}
						</h4>
						{getStatusBadge()}
						{getSignatureStatus()}
						{isExternalProposer() && (
							<span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
								External Proposer
							</span>
						)}
					</div>

					<div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
						<span>
							Signature Weight:{' '}
							{calculateCurrentWeight(
								proposal,
								multisigDetails,
							)}
							/{getTotalWeight(multisigDetails)}
						</span>
						<span className="flex items-center gap-1">
							Address:{' '}
							{formatAddress(proposal.multisigAddress)}
							<CopyButton
								value={proposal.multisigAddress}
								size="sm"
								successMessage="Copied multisig address to clipboard"
							/>
						</span>
						<div className="flex items-center gap-1">
							<span>
								Proposer:{' '}
								{formatAddress(proposal.proposerAddress)}
							</span>
							<CopyButton
								value={proposal.proposerAddress}
								size="sm"
								successMessage="Copied proposer address to clipboard"
							/>
						</div>
						<div className="flex items-center gap-1">
							<span>
								Digest: {formatDigest(proposal.digest)}
							</span>
							<CopyButton
								value={proposal.digest}
								size="sm"
								successMessage="Copied digest to clipboard"
							/>
						</div>
					</div>
				</div>

				<div className="md:ml-4 flex items-center gap-2">
					{isReadyToExecute() && (
						<Button
							size="sm"
							onClick={handleExecuteProposal}
							disabled={executeProposalMutation.isPending}
							variant="default"
						>
							<Rocket className="w-4 h-4 mr-1" />
							{executeProposalMutation.isPending
								? 'Executing...'
								: 'Execute'}
						</Button>
					)}
					{proposal.status === ProposalStatus.PENDING &&
						userHasSigned() && (
							<Button
								size="sm"
								variant="outlineDestructive"
								onClick={() => setShowCancelModal(true)}
								disabled={cancelProposalMutation.isPending}
							>
								{cancelProposalMutation.isPending
									? 'Cancelling...'
									: 'Cancel'}
							</Button>
						)}
					{proposal.status === ProposalStatus.SUCCESS ? (
						<Button size="sm" variant="outline" asChild>
							<a
								href={getExplorerUrl(proposal.digest)}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-1"
							>
								<ExternalLink className="w-4 h-4" />
								View Transaction
							</a>
						</Button>
					) : (
						<Button
							size="sm"
							variant="outline"
							onClick={() => setIsExpanded(!isExpanded)}
						>
							<ToggleIcon
								proposal={proposal}
								isExpanded={isExpanded}
								className="w-4 h-4 mr-1"
							/>
						</Button>
					)}
					{proposal.status === ProposalStatus.PENDING && (
						<Button size="sm" variant="ghost" asChild>
							<CopyButton
								size="md"
								value={`${window.location.origin}/proposals?digest=${proposal.digest}`}
								successMessage="Copied proposal link to clipboard"
							/>
						</Button>
					)}
				</div>
			</div>

			{/* Execute Error */}
			{executeProposalMutation.error && (
				<div className="mx-4 mb-4 border border-red-200 bg-red-50 rounded-lg p-3">
					<h6 className="font-medium text-red-800 mb-1">
						Failed to Execute Transaction
					</h6>
					<p className="text-sm text-red-600">
						{executeProposalMutation.error.message}
					</p>
				</div>
			)}

			{/* Sign Error */}
			{signProposalMutation.error && (
				<div className="mx-4 mb-4 border border-red-200 bg-red-50 rounded-lg p-3">
					<h6 className="font-medium text-red-800 mb-1">
						Failed to Sign Proposal
					</h6>
					<p className="text-sm text-red-600">
						{signProposalMutation.error.message}
					</p>
				</div>
			)}

			{/* Cancel Error */}
			{cancelProposalMutation.error && (
				<div className="mx-4 mb-4 border border-red-200 bg-red-50 rounded-lg p-3">
					<h6 className="font-medium text-red-800 mb-1">
						Failed to Cancel Proposal
					</h6>
					<p className="text-sm text-red-600">
						{cancelProposalMutation.error.message}
					</p>
				</div>
			)}

			{/* Expandable content */}
			{isExpanded && (
				<div className="border-t px-4 py-4">
					{proposal.status === ProposalStatus.SUCCESS && (
						<div className="space-y-3">
							<h5 className="font-medium text-gray-900">
								Transaction Executed
							</h5>
							<p className="text-sm text-gray-600">
								This proposal has been successfully executed
								on-chain.
							</p>
							<div className="flex items-center gap-2">
								<Button size="sm" variant="outline" asChild>
									<a
										href={getExplorerUrl(proposal.digest)}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center gap-1"
									>
										<ExternalLink className="w-4 h-4" />
										View on Explorer
									</a>
								</Button>
								<span className="text-xs text-gray-500">
									Digest: {proposal.digest}
								</span>
							</div>
						</div>
					)}

					{proposal.status === ProposalStatus.PENDING &&
						(isNetworkMismatch ? (
							<div className="space-y-3">
								<h5 className="font-medium text-gray-900">
									Network Mismatch
								</h5>
								<p className="text-sm text-gray-600">
									Switch to{' '}
									<strong>{proposal.network}</strong> to
									view and interact with this proposal.
								</p>
							</div>
						) : (
							<ProposalPreview
								proposal={proposal}
								userHasSigned={userHasSigned()}
								onCancel={() => setShowCancelModal(true)}
								isCancelling={
									cancelProposalMutation.isPending
								}
							/>
						))}

					{(proposal.status === ProposalStatus.FAILURE ||
						proposal.status ===
							ProposalStatus.CANCELLED) && (
						<div className="space-y-3">
							<h5 className="font-medium text-gray-900">
								{proposal.status === ProposalStatus.FAILURE
									? 'Transaction Failed'
									: 'Proposal Cancelled'}
							</h5>
							<p className="text-sm text-gray-600">
								{proposal.status === ProposalStatus.FAILURE
									? 'This proposal failed during execution.'
									: 'This proposal was cancelled and will not be executed.'}
							</p>
						</div>
					)}
				</div>
			)}

			{/* Cancel Confirmation Modal */}
			<CancelProposalModal
				open={showCancelModal}
				onClose={() => setShowCancelModal(false)}
				onConfirm={handleConfirmCancel}
				isLoading={cancelProposalMutation.isPending}
				proposalId={proposal.id}
			/>
		</div>
	);
}

function ToggleIcon({
	proposal,
	isExpanded,
	className,
}: {
	proposal: ProposalWithSignatures;
	isExpanded: boolean;
	className: string;
}) {
	const text = getToggleButtonText(proposal, isExpanded);
	const Icon =
		proposal.status === ProposalStatus.SUCCESS
			? ExternalLink
			: proposal.status === ProposalStatus.PENDING
				? Eye
				: isExpanded
					? ChevronDown
					: ChevronRight;
	return (
		<>
			<Icon className={className} />
			{text}
		</>
	);
}

const getToggleButtonText = (
	proposal: ProposalWithSignatures,
	isExpanded: boolean,
) => {
	if (proposal.status === ProposalStatus.SUCCESS) {
		return isExpanded
			? 'Hide Transaction'
			: 'View Transaction';
	}
	if (proposal.status === ProposalStatus.PENDING) {
		return isExpanded ? 'Hide Preview' : 'Preview Effects';
	}
	return isExpanded ? 'Hide Details' : 'View Details';
};
