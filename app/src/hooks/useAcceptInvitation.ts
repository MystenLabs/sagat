import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSignPersonalMessage, useCurrentAccount } from '@mysten/dapp-kit';
import { apiClient } from '../lib/api';
import { toast } from 'sonner';
import { extractPublicKey } from '../lib/wallet';
import { QueryKeys } from '../lib/queryKeys';

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  return useMutation({
    mutationFn: async (multisigAddress: string) => {
      if (!currentAccount) {
        throw new Error('No wallet connected');
      }

      // Get current account's public key
      const publicKey = extractPublicKey(
        new Uint8Array(currentAccount.publicKey),
        currentAccount.address
      );

      // Create and sign the message
      const message = `Participating in multisig ${multisigAddress}`;
      const result = await signPersonalMessage({
        message: new TextEncoder().encode(message),
      });

      // Call API to accept the invitation
      return apiClient.acceptMultisigInvite(multisigAddress, {
        publicKey: publicKey.toBase64(),
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