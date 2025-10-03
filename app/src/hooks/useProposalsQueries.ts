import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { ProposalStatus, ProposalWithSignatures } from '../lib/types';
import { MultisigWithMembersForPublicKey } from '@/lib/types';
import { calculateCurrentWeight, getTotalWeight } from '../lib/proposalUtils';
import { QueryKeys } from '../lib/queryKeys';
import { useApiAuth } from '@/contexts/ApiAuthContext';

interface UseProposalsQueriesParams {
  multisig: MultisigWithMembersForPublicKey;
  network: string;
  activeFilter: 'all' | 'pending' | 'waiting' | 'ready' | 'executed' | 'cancelled';
}

export function useProposalsQueries({
  multisig,
  network,
  activeFilter
}: UseProposalsQueriesParams) {
  const { currentAddress } = useApiAuth();

  // Query to get full multisig details (including members with weights)
  const multisigDetailsQuery = useQuery({
    queryKey: [QueryKeys.Multisig, multisig.address],
    queryFn: () => apiClient.getMultisig(multisig.address),
    enabled: !!multisig.address,
    staleTime: Infinity, // Cache forever since multisig details are immutable
    gcTime: Infinity,
  });

  // Get API query type based on active tab
  const getApiQueryType = () => {
    switch (activeFilter) {
      case 'executed':
        return 'executed';
      case 'cancelled':
        return 'cancelled';
      case 'pending':
      case 'waiting':
      case 'ready':
        return 'pending';
      default:
        return 'all';
    }
  };

  const apiQueryType = getApiQueryType();

  // Get API filter params based on query type
  const getQueryParams = () => {
    const baseParams = {
      multisigAddress: multisig.address,
      network: network,
    };

    switch (apiQueryType) {
      case 'executed':
        return { ...baseParams, status: ProposalStatus.SUCCESS };
      case 'cancelled':
        return { ...baseParams, status: ProposalStatus.CANCELLED };
      case 'pending':
        return { ...baseParams, status: ProposalStatus.PENDING };
      default:
        return baseParams; // All proposals
    }
  };

  // Main proposals query
  const proposalsQuery = useQuery({
    queryKey: [QueryKeys.Proposals, apiQueryType, multisig.address, network],
    queryFn: () => apiClient.getProposals(getQueryParams()),
    enabled: !!multisig.address && !!network,
    refetchInterval: 30000,
    staleTime: 0, // Consider data stale immediately to ensure fresh data
  });

  // Always fetch pending proposals for counts
  const pendingProposalsQuery = useQuery({
    queryKey: [QueryKeys.Proposals, QueryKeys.Pending, multisig.address, network],
    queryFn: () =>
      apiClient.getProposals({
        multisigAddress: multisig.address,
        network: network,
        status: ProposalStatus.PENDING,
      }),
    enabled: !!multisig.address && !!network,
    refetchInterval: 30000,
    staleTime: 0, // Consider data stale immediately to ensure fresh data
  });

  // Helper to check if current user has signed a proposal
  const userHasSignedProposal = (proposal: ProposalWithSignatures) => {
    if (!currentAddress) return false;
    try {

      return proposal.signatures.some((sig) => sig.publicKey === currentAddress.publicKey);
    } catch (error) {
      console.error('Error checking user signature:', error);
      return false;
    }
  };

  // Filter proposals based on current tab
  const getFilteredProposals = (proposals: ProposalWithSignatures[]) => {
    const multisigDetails = multisigDetailsQuery.data;

    switch (activeFilter) {
      case 'pending':
        return proposals.filter((p) => {
          if (p.status !== ProposalStatus.PENDING) return false;
          const hasUserSigned = userHasSignedProposal(p);
          const currentWeight = calculateCurrentWeight(p, multisigDetails);
          const totalWeight = getTotalWeight(multisigDetails);
          const needsMoreSigs = currentWeight < totalWeight;
          return !hasUserSigned && needsMoreSigs;
        });

      case 'waiting':
        return proposals.filter((p) => {
          if (p.status !== ProposalStatus.PENDING) return false;
          const hasUserSigned = userHasSignedProposal(p);
          const currentWeight = calculateCurrentWeight(p, multisigDetails);
          const totalWeight = getTotalWeight(multisigDetails);
          const needsMoreSigs = currentWeight < totalWeight;
          return hasUserSigned && needsMoreSigs;
        });

      case 'ready':
        return proposals.filter((p) => {
          const currentWeight = calculateCurrentWeight(p, multisigDetails);
          const totalWeight = getTotalWeight(multisigDetails);
          return p.status === ProposalStatus.PENDING && currentWeight >= totalWeight;
        });

      case 'executed':
        return proposals;

      case 'cancelled':
        return proposals;

      default:
        return proposals;
    }
  };

  // Calculate counts for pending tabs
  const getPendingTabCounts = () => {
    const multisigDetails = multisigDetailsQuery.data;
    const pendingProposals = pendingProposalsQuery.data || [];

    if (!multisigDetails?.members || !pendingProposals.length) {
      return { pending: 0, waiting: 0, ready: 0 };
    }

    const pendingCount = pendingProposals.filter((p) => {
      if (p.status !== ProposalStatus.PENDING) return false;
      const hasUserSigned = userHasSignedProposal(p);
      const currentWeight = calculateCurrentWeight(p, multisigDetails);
      const totalWeight = getTotalWeight(multisigDetails);
      const needsMoreSigs = currentWeight < totalWeight;
      return !hasUserSigned && needsMoreSigs;
    }).length;

    const waitingCount = pendingProposals.filter((p) => {
      if (p.status !== ProposalStatus.PENDING) return false;
      const hasUserSigned = userHasSignedProposal(p);
      const currentWeight = calculateCurrentWeight(p, multisigDetails);
      const totalWeight = getTotalWeight(multisigDetails);
      const needsMoreSigs = currentWeight < totalWeight;
      return hasUserSigned && needsMoreSigs;
    }).length;

    const readyCount = pendingProposals.filter((p) => {
      const currentWeight = calculateCurrentWeight(p, multisigDetails);
      const totalWeight = getTotalWeight(multisigDetails);
      return p.status === ProposalStatus.PENDING && currentWeight >= totalWeight;
    }).length;

    return { pending: pendingCount, waiting: waitingCount, ready: readyCount };
  };

  return {
    // Queries
    multisigDetails: multisigDetailsQuery.data,
    proposals: proposalsQuery.data || [],
    isLoading: proposalsQuery.isLoading || multisigDetailsQuery.isLoading,
    error: proposalsQuery.error || multisigDetailsQuery.error,

    // Filtered data
    filteredProposals: getFilteredProposals(proposalsQuery.data || []),
    pendingTabCounts: getPendingTabCounts(),

    // Helpers
    userHasSignedProposal,
  };
}
