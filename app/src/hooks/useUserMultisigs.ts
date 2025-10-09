import { useQuery } from '@tanstack/react-query';

import { type MultisigWithMembersForPublicKey } from '@/lib/types';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

// Hook to fetch user's accepted multisigs from the /addresses/connections endpoint
export function useUserMultisigs() {
	const { isCurrentAddressAuthenticated, currentAddress } =
		useApiAuth();

	return useQuery({
		queryKey: [
			QueryKeys.Multisigs,
			QueryKeys.User,
			currentAddress,
		],
		queryFn: async (): Promise<
			MultisigWithMembersForPublicKey[]
		> => {
			if (!currentAddress)
				throw new Error('No wallet connected');

			// Get accepted multisig connections grouped by public key
			const connections =
				await apiClient.getMultisigConnections();

			return (
				connections[currentAddress?.publicKey] || []
			).map((m) => {
				const currentMember = m.members.find(
					(member) =>
						member.publicKey === currentAddress?.publicKey,
				)!;

				return {
					...m,
					isAccepted: currentMember.isAccepted,
					isRejected: currentMember.isRejected,
					pendingMembers: m.members.filter(
						(member) =>
							!member.isAccepted && !member.isRejected,
					).length,
					rejectedMembers: m.members.filter(
						(member) => member.isRejected,
					).length,
				};
			});
		},
		enabled: isCurrentAddressAuthenticated,
		staleTime: 1000 * 30, // 30 seconds
		refetchInterval: 1000 * 60, // Refetch every minute
	});
}
