// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { useMutation } from '@tanstack/react-query';

/**
 * Dry-runs an arbitrary transaction (passed as either base64 BCS bytes
 * or a JSON serialized Transaction) and returns both the simulation
 * result and the canonical base64-encoded BCS bytes that were sent on
 * the wire. Callers (e.g. `EffectsPreview`) need the bytes to compute
 * the ledger transaction hash, so we expose them alongside the result
 * to avoid the caller having to know the original input format.
 */
export function useDryRun() {
	const client = useDAppKit().getClient();

	return useMutation({
		mutationFn: async (transactionData: string) => {
			const tx = Transaction.from(transactionData);
			const builtBytes = await tx.build({ client });

			const result = await client.simulateTransaction({
				transaction: builtBytes,
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

			return { result, bytes: toBase64(builtBytes) };
		},
		retry: false,
	});
}
