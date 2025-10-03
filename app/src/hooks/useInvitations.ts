import { useQuery } from '@tanstack/react-query';
import { useApiAuth } from '../contexts/ApiAuthContext';
import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';
import { MultisigWithMembersForPublicKey } from '@/lib/types';

// Hook to fetch invitations for the current user's public key
export function useInvitations(showRejected = false, enabled = true) {
  const { isCurrentAddressAuthenticated, currentAddress } = useApiAuth();

  return useQuery({
    queryKey: [QueryKeys.Invitations, currentAddress?.address, showRejected],
    queryFn: async (): Promise<MultisigWithMembersForPublicKey[]> => {
      if (!currentAddress) {
        throw new Error('No wallet connected');
      }

      // Get invitations for this public key
      const invitations = await apiClient.getInvitations(currentAddress.publicKey, showRejected);

      // Transform to add the fields expected by components
      return invitations.map((m) => {
        const currentMember = m.members.find((member) => member.publicKey === currentAddress.publicKey)!;
        return {
          ...m,
          isAccepted: currentMember.isAccepted,
          isRejected: currentMember.isRejected,
          pendingMembers: m.members.filter(member => !member.isAccepted && !member.isRejected).length,
          rejectedMembers: m.members.filter(member => member.isRejected).length,
        };
      });
    },
    enabled: isCurrentAddressAuthenticated && !!currentAddress && enabled,
    staleTime: 0, // Don't cache - always refetch when needed
    refetchOnMount: true, // Refetch when component mounts
  });
}
