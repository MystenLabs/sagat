// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import { RpcError } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { useMutation } from '@tanstack/react-query';

/** The simulation ran and the transaction failed; the message says why. */
export class SimulationFailedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SimulationFailedError';
	}
}

// The codes a node refuses the transaction itself with, such as for an
// input object that doesn't exist.
const REFUSED_CODES = [
	'INVALID_ARGUMENT',
	'FAILED_PRECONDITION',
	'NOT_FOUND',
	'OUT_OF_RANGE',
];

// The node refuses an expired transaction with INTERNAL, the code the SDK
// also uses for a node it can't reach, so this one is told by the node's
// message.
const EXPIRED_MESSAGE = 'Transaction Expired';

/**
 * Whether a failed dry run couldn't be run at all (offline, a timeout, a
 * 5xx), where trying again may help. False when the error is a verdict
 * on the transaction: it ran and failed, or the node refused it.
 */
export function couldNotSimulate(error: unknown): boolean {
	return !(
		error instanceof SimulationFailedError ||
		(error instanceof RpcError &&
			(REFUSED_CODES.includes(error.code) ||
				error.message === EXPIRED_MESSAGE))
	);
}

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
				throw new SimulationFailedError(
					result.FailedTransaction.effects.status.error
						?.message ?? '',
				);
			}

			return result;
		},
		retry: false,
	});
}
