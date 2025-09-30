import { useQuery } from '@tanstack/react-query';
import { useApiAuth } from '../contexts/ApiAuthContext';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { apiClient } from '../lib/api';
import { extractPublicKey } from '../lib/wallet';
import { QueryKeys } from '../lib/queryKeys';
import { MultisigWithMembersForPublicKey } from '@/lib/types';

// Hook to fetch user's multisigs from the /addresses/connections endpoint
export function useUserMultisigs(showPending = false) {
  const { isCurrentAddressAuthenticated, currentAddress } = useApiAuth();
  const currentAccount = useCurrentAccount();

  return useQuery({
    queryKey: [QueryKeys.Multisigs, QueryKeys.User, currentAddress, showPending],
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

      // Get multisig connections grouped by public key
      const connections = await apiClient.getMultisigConnections(showPending);

      return (connections[pubKeyBase64] || []).map((m) => ({
        ...m,
        isAccepted: m.members.find((m) => m.publicKey === pubKeyBase64)!.isAccepted,
        pendingMembers: m.members.filter(m => !m.isAccepted).length,
      }))
    },
    enabled: isCurrentAddressAuthenticated,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Refetch every minute
  });
}
