// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import {
	fromBase64,
	toBase64,
} from '@mysten/sui/utils';
import { useMutation } from '@tanstack/react-query';

/**
 * Dry-runs an arbitrary transaction (base64 BCS bytes or a JSON
 * serialized `Transaction`) and returns both the simulation result and
 * the exact base64 bytes that were simulated.
 *
 * For base64 input we simulate those bytes directly (no rebuild), so
 * downstream components can rely on byte identity.
 */
export function useDryRun() {
	const client = useDAppKit().getClient();

	return useMutation({
		mutationFn: async (transactionData: string) => {
			const trimmed = transactionData.trim();
			let bytes: Uint8Array;
			let transactionBytes: string;

			try {
				bytes = fromBase64(trimmed);
				transactionBytes = trimmed;
			} catch {
				const tx = Transaction.from(trimmed);
				bytes = await tx.build({ client });
				transactionBytes = toBase64(bytes);
			}

			const result = await client.simulateTransaction({
				transaction: bytes,
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

			return { result, bytes: transactionBytes };
		},
		retry: false,
	});
}
