// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useDAppKit } from '@mysten/dapp-kit-react';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import {
	analyze,
	analyzers,
	type AnalyzedCommand,
	type BalanceFlowsResult,
	type TransactionAnalysisIssue,
} from '@mysten/wallet-sdk';
import { useMutation } from '@tanstack/react-query';

type AccessLevel = 'read' | 'mutate' | 'transfer';

type AnalysisSection<T> =
	| {
			result: T;
			issues?: never;
			ownIssues?: never;
	  }
	| {
			result?: never;
			issues: TransactionAnalysisIssue[];
			ownIssues: TransactionAnalysisIssue[];
	  };

export interface TransactionAnalysis {
	commands: AnalysisSection<AnalyzedCommand[]>;
	accessLevel: AnalysisSection<Record<string, AccessLevel>>;
	balanceFlows: AnalysisSection<BalanceFlowsResult>;
	issues: TransactionAnalysisIssue[];
}

const selectedAnalyzers = {
	commands: analyzers.commands,
	accessLevel: analyzers.accessLevel,
	balanceFlows: analyzers.balanceFlows,
};

export async function analyzeTransaction(
	transaction: string,
	client: ClientWithCoreApi,
): Promise<TransactionAnalysis> {
	const result = await analyze(selectedAnalyzers, {
		transaction,
		client,
		balanceFlows: {
			excludeGasBudget: true,
		},
	});

	return result as TransactionAnalysis;
}

export function useTransactionAnalysis() {
	const client = useDAppKit().getClient();

	return useMutation({
		mutationFn: (transactionData: string) =>
			analyzeTransaction(
				transactionData,
				client as ClientWithCoreApi,
			),
		retry: false,
	});
}
