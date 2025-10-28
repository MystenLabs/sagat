// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	getFullnodeUrl,
	SuiClient,
} from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { useMutation } from '@tanstack/react-query';

import { type LocalNetwork } from '@/components/LocalNetworkSelector';

export function useDryRunWithNetwork(
	network: LocalNetwork,
) {
	return useMutation({
		mutationFn: async (transactionData: string) => {
			// Create a client for the specified network
			const client = new SuiClient({
				url: getFullnodeUrl(network),
			});

			// Parse and create transaction from JSON
			const tx = Transaction.from(transactionData);

			// Execute dry run
			const result = await client.dryRunTransactionBlock({
				transactionBlock: await tx.build({ client }),
			});

			// Check for errors in the result
			if (result.effects.status.status === 'failure') {
				const errorMsg =
					result.effects.status.error ||
					'Transaction would fail';
				throw new Error(errorMsg);
			}

			return result;
		},
		retry: false,
	});
}
