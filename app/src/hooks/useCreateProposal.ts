import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSignTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { apiClient } from '../lib/api';
import { toast } from 'sonner';
import { Transaction } from '@mysten/sui/transactions';
import { useNetwork } from '../contexts/NetworkContext';
import { QueryKeys } from '../lib/queryKeys';
import { useApiAuth } from '@/contexts/ApiAuthContext';

interface CreateProposalParams {
  multisigAddress: string;
  transactionData: string;
  description?: string;
}

export function useCreateProposal() {
  const { network } = useNetwork();
  const currentAccount = useCurrentAccount();
  const queryClient = useQueryClient();
  const { mutateAsync: signTransaction } = useSignTransaction();
  const { currentAddress } = useApiAuth();

  return useMutation({
    mutationFn: async ({ multisigAddress, transactionData, description }: CreateProposalParams) => {
      if (!currentAddress || !currentAccount) {
        throw new Error("No connected account");
      }

      // Parse transaction data
      const transaction = Transaction.from(transactionData);

      // Sign the transaction (it will build and sign automatically)
      const signatureResult = await signTransaction({
        transaction,
        account: currentAccount,
      });

      // Create proposal via API
      return apiClient.createProposal({
        multisigAddress,
        transactionBytes: transactionData,
        publicKey: currentAddress.publicKey,
        signature: signatureResult.signature as string,
        description,
        network,
      });
    },
    onSuccess: () => {
      // Invalidate all proposal-related queries
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Proposals] });
      toast.success("Proposal created successfully!");
    },
  });
}
