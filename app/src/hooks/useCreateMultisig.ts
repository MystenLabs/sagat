import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../lib/api";
import { toast } from "sonner";
import type { CreateMultisigForm } from "../lib/validations/multisig";
import { QueryKeys } from "../lib/queryKeys";
import { useApiAuth } from "@/contexts/ApiAuthContext";

export function useCreateMultisig() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { currentAddress } = useApiAuth();

  return useMutation({
    mutationFn: async (data: CreateMultisigForm) => {
      if (!currentAddress) throw new Error("No wallet connected");

      // Extract public keys and weights directly
      const publicKeys = data.members.map((m) => m.publicKey);
      const weights = data.members.map((m) => m.weight);

      const payload = {
        publicKey: currentAddress.publicKey,
        publicKeys,
        weights,
        threshold: data.threshold,
        name: data.name || undefined,
      };

      return apiClient.createMultisig(payload);
    },
    onSuccess: () => {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Multisigs] });

      toast.success("Multisig created successfully!");

      // Navigate to dashboard
      navigate("/");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create multisig: ${error.message}`);
    },
  });
}
