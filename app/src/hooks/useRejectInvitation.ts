import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";
import { apiClient } from "../lib/api";
import { toast } from "sonner";
import { QueryKeys } from "@/lib/queryKeys";
import { useApiAuth } from "@/contexts/ApiAuthContext";

export function useRejectInvitation() {
  const currentAccount = useCurrentAccount();
  const queryClient = useQueryClient();
  const { currentAddress } = useApiAuth();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  return useMutation({
    mutationFn: async (multisigAddress: string) => {
      if (!currentAccount || !currentAddress) {
        throw new Error("No wallet connected");
      }

      // Sign rejection message
      const message = `Rejecting multisig invitation ${multisigAddress}`;
      const result = await signPersonalMessage({
        message: new TextEncoder().encode(message),
        account: currentAccount,
      });

      // Send to API
      return apiClient.rejectMultisigInvite(multisigAddress, {
        publicKey: currentAddress.publicKey,
        signature: result.signature,
      });
    },
    onSuccess: () => {
      toast.success("Invitation rejected successfully!");
      // Invalidate the multisig queries to refresh the list
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Multisigs] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Invitations] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to reject invitation: ${error.message}`);
    },
  });
}
