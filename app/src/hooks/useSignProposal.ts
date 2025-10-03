import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSignTransaction, useCurrentAccount } from "@mysten/dapp-kit";
import { apiClient } from "../lib/api";
import { toast } from "sonner";
import { Transaction } from "@mysten/sui/transactions";
import { QueryKeys } from "../lib/queryKeys";
import { useApiAuth } from "@/contexts/ApiAuthContext";

interface SignProposalParams {
  proposalId: number;
  builtTransactionBytes: string;
}

export function useSignProposal() {
  const currentAccount = useCurrentAccount();
  const queryClient = useQueryClient();
  const { currentAddress } = useApiAuth();
  const { mutateAsync: signTransaction } = useSignTransaction();

  return useMutation({
    mutationFn: async ({
      proposalId,
      builtTransactionBytes,
    }: SignProposalParams) => {
      if (!currentAddress || !currentAccount) {
        throw new Error("No connected account");
      }

      // Create transaction from built bytes for signing
      const transaction = Transaction.from(builtTransactionBytes);

      // Sign the transaction
      const result = await signTransaction({
        transaction,
        account: currentAccount,
      });

      // Call API to vote on the proposal
      return apiClient.voteOnProposal(proposalId, {
        publicKey: currentAddress.publicKey,
        signature: result.signature as string,
      });
    },
    onSuccess: () => {
      // Invalidate all proposal-related queries
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Proposals] });
      toast.success("Proposal signed successfully!");
    },
  });
}
