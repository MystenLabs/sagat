// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	couldNotSimulate,
	SimulationFailedError,
	type useDryRun,
} from '@/hooks/useDryRun';
import type {
	SimulatedTransaction,
	SimulationStatus,
} from '@/lib/transaction-preview';

export interface SimulationProps {
	status: SimulationStatus;
	result: SimulatedTransaction | null;
	error: string | null;
	simulatedAt: Date | null;
}

/** A simulation that hasn't settled yet. */
export const pendingSimulation: SimulationProps = {
	status: 'pending',
	result: null,
	error: null,
	simulatedAt: null,
};

/**
 * The Transaction preview's simulation props from a dry run: pending
 * until it settles (not started counts as pending, so the first frame
 * doesn't flash an empty result), then passed or failed. Null when the
 * dry run couldn't run at all (offline, a timeout), where there is no
 * verdict to show and the caller offers a retry instead.
 */
export function simulationProps(
	dryRun: ReturnType<typeof useDryRun>,
): SimulationProps | null {
	if (dryRun.isSuccess) {
		const transaction = dryRun.data.Transaction ?? null;
		return {
			status: transaction?.effects.status.success
				? 'passed'
				: 'failed',
			result: transaction,
			error: null,
			simulatedAt: new Date(dryRun.submittedAt),
		};
	}
	if (dryRun.isError) {
		const error = dryRun.error;
		if (couldNotSimulate(error)) return null;
		return {
			status: 'failed',
			result:
				error instanceof SimulationFailedError
					? error.transaction
					: null,
			error: error.message || null,
			simulatedAt: new Date(dryRun.submittedAt),
		};
	}
	return pendingSimulation;
}
