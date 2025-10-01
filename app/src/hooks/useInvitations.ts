import { useQuery } from '@tanstack/react-query';
import { useApiAuth } from '../contexts/ApiAuthContext';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { apiClient } from '../lib/api';
import { extractPublicKey } from '../lib/wallet';
import { QueryKeys } from '../lib/queryKeys';
import { MultisigWithMembersForPublicKey } from '@/lib/types';

// Hook to fetch invitations for the current user's public key
export function useInvitations(showRejected = false, enabled = true) {
  const { isCurrentAddressAuthenticated } = useApiAuth();
  const currentAccount = useCurrentAccount();

  return useQuery({
    queryKey: [QueryKeys.Invitations, currentAccount?.address, showRejected],
    queryFn: async (): Promise<MultisigWithMembersForPublicKey[]> => {
      if (!currentAccount) {
        throw new Error('No wallet connected');
      }

      // Get the current account's public key in base64 format
      const publicKey = extractPublicKey(
        new Uint8Array(currentAccount.publicKey),
        currentAccount.address
      );
      const pubKeyBase64 = publicKey.toBase64();

      // Get invitations for this public key
      const invitations = await apiClient.getInvitations(pubKeyBase64, showRejected);

      // Transform to add the fields expected by components
      return invitations.map((m) => {
        const currentMember = m.members.find((member) => member.publicKey === pubKeyBase64)!;
        return {
          ...m,
          isAccepted: currentMember.isAccepted,
          isRejected: currentMember.isRejected,
          pendingMembers: m.members.filter(member => !member.isAccepted && !member.isRejected).length,
          rejectedMembers: m.members.filter(member => member.isRejected).length,
        };
      });
    },
    enabled: isCurrentAddressAuthenticated && !!currentAccount && enabled,
    staleTime: 0, // Don't cache - always refetch when needed
    refetchOnMount: true, // Refetch when component mounts
  });
}
