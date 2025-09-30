import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";
import { apiClient } from "../lib/api";
import { extractPublicKey } from "../lib/wallet";
import { toast } from "sonner";
import { QueryKeys } from "@/lib/queryKeys";

export function useRejectInvitation() {
  const currentAccount = useCurrentAccount();
  const queryClient = useQueryClient();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  return useMutation({
    mutationFn: async (multisigAddress: string) => {
      if (!currentAccount) {
        throw new Error("No wallet connected");
      }

      // Extract public key
      const publicKey = extractPublicKey(
        new Uint8Array(currentAccount.publicKey),
        currentAccount.address
      );

      // Sign rejection message
      const message = `Rejecting multisig invitation ${multisigAddress}`;
      const result = await signPersonalMessage({
        message: new TextEncoder().encode(message),
        account: currentAccount,
      });

      // Send to API
      return apiClient.rejectMultisigInvite(multisigAddress, {
        publicKey: publicKey.toBase64(),
        signature: result.signature,
      });
    },
    onSuccess: () => {
      toast.success("Invitation rejected");
      // Invalidate the multisig queries to refresh the list
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Multisigs] });
    },
    onError: (error: Error) => {
      console.error("Failed to reject invitation:", error);
      toast.error(`Failed to reject invitation: ${error.message}`);
    },
  });
}
