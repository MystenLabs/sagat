import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSignPersonalMessage } from '@mysten/dapp-kit';
import { apiClient } from '../lib/api';
import { toast } from 'sonner';
import { QueryKeys } from '../lib/queryKeys';
import { useApiAuth } from '@/contexts/ApiAuthContext';

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { currentAddress } = useApiAuth();

  return useMutation({
    mutationFn: async (multisigAddress: string) => {
      if (!currentAddress) throw new Error('No wallet connected');

      // Create and sign the message
      const message = `Participating in multisig ${multisigAddress}`;
      const result = await signPersonalMessage({
        message: new TextEncoder().encode(message),
      });

      // Call API to accept the invitation
      return apiClient.acceptMultisigInvite(multisigAddress, {
        publicKey: currentAddress.publicKey,
        signature: result.signature,
      });
    },
    onSuccess: () => {
      // Invalidate queries to refresh multisig data
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Multisigs] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Invitations] });
      toast.success('Invitation accepted successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to accept invitation: ${error.message}`);
    },
  });
}
