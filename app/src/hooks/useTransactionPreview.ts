// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCallback } from 'react';

import { useDryRun } from './useDryRun';
import { useTransactionAnalysis } from './useTransactionAnalysis';

export function useTransactionPreview() {
	const dryRun = useDryRun();
	const analysis = useTransactionAnalysis();
	const { mutate: dryRunTransaction, reset: resetDryRun } =
		dryRun;
	const {
		mutate: analyzeTransaction,
		reset: resetAnalysis,
	} = analysis;

	const reset = useCallback(() => {
		resetAnalysis();
		resetDryRun();
	}, [resetAnalysis, resetDryRun]);

	const preview = useCallback(
		(transactionData: string) => {
			reset();
			analyzeTransaction(transactionData);
			dryRunTransaction(transactionData);
		},
		[analyzeTransaction, dryRunTransaction, reset],
	);

	return {
		dryRun,
		analysis,
		preview,
		reset,
		isPreviewing: dryRun.isPending || analysis.isPending,
	};
}
