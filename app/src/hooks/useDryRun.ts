// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { useMutation } from '@tanstack/react-query';

export function useDryRun() {
	const client = useDAppKit().getClient();

	return useMutation({
		mutationFn: async (transactionData: string) => {
			const tx = Transaction.from(transactionData);

			const result = await client.simulateTransaction({
				transaction: await tx.build({ client }),
				include: {
					effects: true,
					balanceChanges: true,
					events: true,
					transaction: true,
					objectTypes: true,
				},
			});

			if (result.FailedTransaction) {
				throw new Error(
					result.FailedTransaction.effects.status.error
						?.message,
				);
			}

			return result;
		},
		retry: false,
	});
}
