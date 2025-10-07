import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import { MultiSigPublicKey } from "@mysten/sui/multisig";
import { apiClient } from "../lib/api";
import { toast } from "sonner";
import { QueryKeys } from "../lib/queryKeys";
import { MultisigWithMembers, ProposalWithSignatures } from "../lib/types";
import { extractPublicKeyFromBase64 } from "@/lib/wallet";

interface ExecuteProposalParams {
  proposal: ProposalWithSignatures;
  multisigDetails: MultisigWithMembers;
}

export function useExecuteProposal() {
  const queryClient = useQueryClient();
  const suiClient = useSuiClient();

  return useMutation({
    mutationFn: async ({
      proposal,
      multisigDetails,
    }: ExecuteProposalParams) => {
      if (!multisigDetails) {
        throw new Error("Multisig details not provided");
      }

      try {
        // Order the members.
        const multisigMembers = multisigDetails.members.sort(
          (a, b) => a.order - b.order,
        );
        // Step 1: Reconstruct the MultiSigPublicKey
        const publicKeys = multisigMembers.map((member) => ({
          publicKey: extractPublicKeyFromBase64(member.publicKey),
          weight: member.weight,
        }));

        const multiSigPublicKey = MultiSigPublicKey.fromPublicKeys({
          threshold: multisigDetails.threshold,
          publicKeys,
        });

        // Step 2: Map signatures to the correct order based on the multisig public key order
        // The signatures need to be in the same order as the public keys in the multisig
        const orderedSignatures: string[] = [];
        for (const member of multisigMembers) {
          const signature = proposal.signatures.find(
            (sig) => sig.publicKey === member.publicKey,
          );
          if (signature) {
            orderedSignatures.push(signature.signature);
          }
        }

        const combinedSignature =
          multiSigPublicKey.combinePartialSignatures(orderedSignatures);

        // Step 3: Execute the transaction with the combined signature
        const result = await suiClient.executeTransactionBlock({
          transactionBlock: proposal.transactionBytes,
          signature: combinedSignature,
          options: {
            showEffects: true,
            showObjectChanges: true,
          },
        });

        await suiClient.waitForTransaction({ digest: result.digest });

        // Sleep for 500ms to give a bit more time to index.
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Step 4: Call the verify endpoint to update proposal status in the backend
        const verifyResponse = await apiClient.verifyProposal(proposal.id);

        return { executionResult: result, verifyResponse };
      } catch (error) {
        throw error;
      }
    },
    onSuccess: (data) => {
      // Invalidate all proposal-related queries
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Proposals] });
      toast.success(
        `Transaction executed successfully! Digest: ${data.executionResult.digest}`,
      );
    },
    onError: (error: Error) => {
      toast.error(`Failed to execute proposal: ${error.message}`);
    },
  });
}
