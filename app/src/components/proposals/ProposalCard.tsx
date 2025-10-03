import { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, ExternalLink, CheckCircle, Clock, Rocket, Copy, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../ui/button';
import { ProposalWithSignatures, ProposalStatus } from '../../lib/types';
import { useNetwork } from '../../contexts/NetworkContext';
import { ProposalPreview } from './ProposalPreview';
import { apiClient } from '../../lib/api';
import { calculateCurrentWeight, getTotalWeight } from '../../lib/proposalUtils';
import { QueryKeys } from '../../lib/queryKeys';
import { useExecuteProposal } from '../../hooks/useExecuteProposal';
import { useVerifyProposal } from '../../hooks/useVerifyProposal';
import { useCancelProposal } from '../../hooks/useCancelProposal';
import { useSignProposal } from '../../hooks/useSignProposal';
import { CancelProposalModal } from '../modals/CancelProposalModal';
import { useApiAuth } from '@/contexts/ApiAuthContext';

interface ProposalCardProps {
  proposal: ProposalWithSignatures;
}

export function ProposalCard({ proposal }: ProposalCardProps) {
  const { network } = useNetwork();
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedDigest, setCopiedDigest] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const executeProposalMutation = useExecuteProposal();
  const verifyProposalMutation = useVerifyProposal();
  const cancelProposalMutation = useCancelProposal();
  const signProposalMutation = useSignProposal();

  // Query to get full multisig details (including members with weights)
  const { data: multisigDetails } = useQuery({
    queryKey: [QueryKeys.Multisig, proposal.multisigAddress],
    queryFn: () => apiClient.getMultisig(proposal.multisigAddress),
    enabled: !!proposal.multisigAddress,
    staleTime: Infinity, // Cache forever since multisig details are immutable
    gcTime: Infinity, // Keep in cache forever
  });

  // Check if current user has already signed this proposal
  // Check if the proposal is ready to execute
  const isReadyToExecute = () => {
    if (!multisigDetails || proposal.status !== ProposalStatus.PENDING) return false;
    const currentWeight = calculateCurrentWeight(proposal, multisigDetails);
    const threshold = getTotalWeight(multisigDetails);
    return currentWeight >= threshold;
  };

  const handleExecuteProposal = () => {
    if (!multisigDetails) return;
    executeProposalMutation.mutate(
      {
        proposal,
        multisigDetails
      },
      {
        onError: () => {
          // If execution fails, try to verify (it might have been executed by someone else)
          verifyProposalMutation.mutate(proposal.id);
        }
      }
    );
  };

  const handleCopyDigest = async () => {
    await navigator.clipboard.writeText(proposal.digest);
    setCopiedDigest(true);
    setTimeout(() => setCopiedDigest(false), 2000);
  };

  const handleCancelProposal = () => {
    setShowCancelModal(true);
  };

  const handleConfirmCancel = () => {
    cancelProposalMutation.mutate(proposal.id, {
      onSuccess: () => {
        setShowCancelModal(false);
      }
    });
  };

  const { currentAddress } = useApiAuth();


  const userHasSigned = () => {
    if (!currentAddress) return false;
    return proposal.signatures.some(sig => sig.publicKey === currentAddress.publicKey);
  };

  const getProposalTitle = () => {
    // Use description if available, otherwise use a truncated digest
    if (proposal.description?.trim()) {
      return proposal.description.trim();
    }
    return `Transaction ${proposal.digest.slice(0, 8)}...${proposal.digest.slice(-4)}`;
  };

  const getStatusBadge = () => {
    if (proposal.status === ProposalStatus.SUCCESS) {
      return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Executed</span>;
    }
    if (proposal.status === ProposalStatus.CANCELLED) {
      return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">Cancelled</span>;
    }
    if (proposal.status === ProposalStatus.FAILURE) {
      return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">Failed</span>;
    }

    // Pending - check if ready to execute using the proper helpers
    const currentWeight = calculateCurrentWeight(proposal, multisigDetails);
    const totalWeight = getTotalWeight(multisigDetails);
    if (currentWeight >= totalWeight) {
      return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">Ready to Execute</span>;
    }
    return <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">Pending</span>;
  };

  const getExplorerUrl = (digest: string) => {
    return network === 'testnet'
      ? `https://suiscan.xyz/testnet/tx/${digest}`
      : `https://suiscan.xyz/mainnet/tx/${digest}`;
  };

  const getToggleButtonText = () => {
    if (proposal.status === ProposalStatus.SUCCESS) {
      return isExpanded ? 'Hide Transaction' : 'View Transaction';
    }
    if (proposal.status === ProposalStatus.PENDING) {
      return isExpanded ? 'Hide Preview' : 'Preview Effects';
    }
    return isExpanded ? 'Hide Details' : 'View Details';
  };

  const getToggleIcon = () => {
    if (proposal.status === ProposalStatus.SUCCESS) {
      return ExternalLink;
    }
    if (proposal.status === ProposalStatus.PENDING) {
      return Eye;
    }
    return isExpanded ? ChevronDown : ChevronRight;
  };

  const getSignatureStatus = () => {
    if (proposal.status !== ProposalStatus.PENDING) return null;

    if (userHasSigned()) {
      return (
        <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
          <CheckCircle className="w-3 h-3" />
          Already Signed
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
        <Clock className="w-3 h-3" />
        Pending Signature
      </div>
    );
  };

  const Icon = getToggleIcon();

  return (
    <div className="bg-white border rounded-lg hover:shadow-sm transition-shadow">
      {/* Main proposal row */}
      <div className="flex items-start justify-between p-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h4 className="font-medium text-gray-900 line-clamp-1">
              {getProposalTitle()}
            </h4>
            {getStatusBadge()}
            {getSignatureStatus()}
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>ID: {proposal.id}</span>
            <span>Signatures: {calculateCurrentWeight(proposal, multisigDetails)}/{getTotalWeight(multisigDetails)}</span>
            <div className="flex items-center gap-1">
              <span>Digest: {proposal.digest.slice(0, 8)}...{proposal.digest.slice(-8)}</span>
              <button
                onClick={handleCopyDigest}
                className="p-0.5 hover:bg-gray-100 rounded transition-colors"
                title="Copy full digest"
              >
                {copiedDigest ? (
                  <Check className="w-3 h-3 text-green-600" />
                ) : (
                  <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="ml-4 flex items-center gap-2">
          {isReadyToExecute() && (
            <Button
              size="sm"
              onClick={handleExecuteProposal}
              disabled={executeProposalMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Rocket className="w-4 h-4 mr-1" />
              {executeProposalMutation.isPending ? 'Executing...' : 'Execute'}
            </Button>
          )}
          {proposal.status === ProposalStatus.PENDING && userHasSigned() && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancelProposal}
              disabled={cancelProposalMutation.isPending}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              {cancelProposalMutation.isPending ? 'Cancelling...' : 'Cancel'}
            </Button>
          )}
          {proposal.status === ProposalStatus.SUCCESS ? (
            <Button
              size="sm"
              variant="outline"
              asChild
            >
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
              <Icon className="w-4 h-4 mr-1" />
              {getToggleButtonText()}
            </Button>
          )}
        </div>
      </div>

      {/* Execute Error */}
      {executeProposalMutation.error && (
        <div className="mx-4 mb-4 border border-red-200 bg-red-50 rounded-lg p-3">
          <h6 className="font-medium text-red-800 mb-1">Failed to Execute Transaction</h6>
          <p className="text-sm text-red-600">
            {executeProposalMutation.error.message}
          </p>
        </div>
      )}

      {/* Sign Error */}
      {signProposalMutation.error && (
        <div className="mx-4 mb-4 border border-red-200 bg-red-50 rounded-lg p-3">
          <h6 className="font-medium text-red-800 mb-1">Failed to Sign Proposal</h6>
          <p className="text-sm text-red-600">
            {signProposalMutation.error.message}
          </p>
        </div>
      )}

      {/* Cancel Error */}
      {cancelProposalMutation.error && (
        <div className="mx-4 mb-4 border border-red-200 bg-red-50 rounded-lg p-3">
          <h6 className="font-medium text-red-800 mb-1">Failed to Cancel Proposal</h6>
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
              <h5 className="font-medium text-gray-900">Transaction Executed</h5>
              <p className="text-sm text-gray-600">
                This proposal has been successfully executed on-chain.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                >
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

          {proposal.status === ProposalStatus.PENDING && (
            <ProposalPreview
              proposal={proposal}
              userHasSigned={userHasSigned()}
              onCancel={handleCancelProposal}
              isCancelling={cancelProposalMutation.isPending}
            />
          )}

          {(proposal.status === ProposalStatus.FAILURE || proposal.status === ProposalStatus.CANCELLED) && (
            <div className="space-y-3">
              <h5 className="font-medium text-gray-900">
                {proposal.status === ProposalStatus.FAILURE ? 'Transaction Failed' : 'Proposal Cancelled'}
              </h5>
              <p className="text-sm text-gray-600">
                {proposal.status === ProposalStatus.FAILURE
                  ? 'This proposal failed during execution.'
                  : 'This proposal was cancelled and will not be executed.'
                }
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
