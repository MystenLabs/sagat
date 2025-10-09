import {
	useCurrentAccount,
	useSignPersonalMessage,
} from '@mysten/dapp-kit';
import {
	defaultExpiry,
	PersonalMessages,
} from '@mysten/sagat';
import {
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

export function useRemoveProposer(
	multisigAddress: string,
	options?: {
		onSuccess?: () => void;
	},
) {
	const queryClient = useQueryClient();
	const { mutateAsync: signMessage } =
		useSignPersonalMessage();
	const currentAccount = useCurrentAccount();

	return useMutation({
		mutationFn: async (proposerAddress: string) => {
			if (!currentAccount?.address) {
				throw new Error('No wallet connected');
			}

			const expiry = defaultExpiry();
			const message =
				PersonalMessages.removeMultisigProposer(
					proposerAddress,
					multisigAddress,
					expiry,
				);

			const { signature } = await signMessage({
				message: new TextEncoder().encode(message),
			});

			return apiClient.removeMultisigProposer(
				multisigAddress,
				proposerAddress,
				signature,
				expiry,
			);
		},
		onSuccess: () => {
			// Invalidate the multisig query to refetch with updated proposers
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisig, multisigAddress],
			});
			toast.success('Proposer removed successfully');
			options?.onSuccess?.();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: 'Failed to remove proposer',
			);
		},
	});
}
