// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { messageWithIntent } from '@mysten/sui/cryptography';
import { fromBase64, toHex } from '@mysten/sui/utils';
import { blake2b } from '@noble/hashes/blake2.js';
import { HelpCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Tabs } from '@/components/ui/tabs';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';

import type { TransactionAnalysis } from '../../hooks/useTransactionAnalysis';
import { Alert } from '../ui/Alert';
import { Textarea } from '../ui/textarea';
import { IntentSummary } from './IntentSummary';
import { BalanceChanges } from './partials/BalanceChanges';
import { Events } from './partials/Events';
import { ObjectChanges } from './partials/ObjectChanges';
import { Overview } from './partials/Overview';
import { Transactions } from './partials/Transactions';

function PreviewModeHelp() {
	return (
		<TooltipProvider delayDuration={150}>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label="Explain simulation and static analyzer"
						className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<HelpCircle className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent
					side="bottom"
					align="start"
					className="max-w-sm bg-card text-card-foreground border shadow-lg"
				>
					<div className="space-y-2 text-xs leading-relaxed">
						<p>
							<strong>Simulation Result</strong> shows one
							dry run against current on-chain state. It is
							useful for expected effects, but it is not
							guaranteed to capture the full possible
							outflow because on-chain state can change
							before execution.
						</p>
						<p>
							<strong>Static Analyzer</strong> inspects the
							transaction itself and estimates the maximum
							statically allowed balance outflow, excluding
							gas payment. It is intended to help protect
							against on-chain state attacks.
						</p>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export function EffectsPreview({
	output,
	bytes,
	analysis,
	isAnalysisLoading,
	analysisError,
}: {
	output: SuiClientTypes.SimulateTransactionResult<{
		effects: true;
		balanceChanges: true;
		events: true;
		transaction: true;
		objectTypes: true;
	}>;
	bytes?: string;
	analysis?: TransactionAnalysis;
	isAnalysisLoading?: boolean;
	analysisError?: Error | null;
}) {
	const [activePreviewTab, setActivePreviewTab] = useState(
		'simulation-result',
	);
	const [activeSimulationTab, setActiveSimulationTab] =
		useState('balance-changes');

	const objectChanges =
		output.Transaction!.effects.changedObjects;
	const balanceChanges = output.Transaction!.balanceChanges;
	const objectTypes = output.Transaction!.objectTypes;
	const senderAddress =
		output.Transaction!.transaction.sender ?? undefined;

	// Compute the blake2b hash (ledger transaction hash)
	const ledgerTransactionHash = useMemo(() => {
		if (!bytes) return null;
		// Decode the base64-encoded transaction bytes
		const decodedBytes = fromBase64(bytes);
		const intentMessage = messageWithIntent(
			'TransactionData',
			decodedBytes,
		);
		const intentMessageDigest = blake2b(intentMessage, {
			dkLen: 32,
		});
		const intentMessageDigestHex = toHex(
			intentMessageDigest,
		);
		return `0x${intentMessageDigestHex}`;
	}, [bytes]);

	const tabs = [
		{
			id: 'balance-changes',
			label: 'Balance Changes',
			count: balanceChanges?.length,
			component: () => (
				<BalanceChanges
					changes={balanceChanges}
					senderAddress={senderAddress}
				/>
			),
		},
		{
			id: 'object-changes',
			label: 'Object Changes',
			count: objectChanges?.length,
			component: () => (
				<ObjectChanges
					objects={objectChanges}
					objectTypes={objectTypes}
					senderAddress={senderAddress}
				/>
			),
		},
		{
			id: 'events',
			label: 'Events',
			count: output.Transaction!.events.length,
			component: () => (
				<Events events={output.Transaction!.events} />
			),
		},
		{
			id: 'transactions',
			label: 'Transactions',
			count:
				output.Transaction?.transaction.commands.length ||
				0,
			component: () => (
				<Transactions
					inputs={output.Transaction!.transaction!}
				/>
			),
		},
		{
			id: 'json',
			label: 'Raw JSON',
			component: () => (
				<Textarea
					value={JSON.stringify(output, null, 4)}
					rows={20}
					readOnly
					className="font-mono text-xs"
				/>
			),
		},
	];

	const activeTabData = tabs.find(
		(t) => t.id === activeSimulationTab,
	);
	const analysisIssueCount =
		(analysis?.issues.length ?? 0) +
		(analysisError ? 1 : 0);
	const topTabs = [
		{
			id: 'simulation-result',
			label: 'Simulation Result',
		},
		{
			id: 'transaction-analysis',
			label: 'Static Analyzer',
			count: analysisIssueCount,
		},
	];

	return (
		<div className="space-y-4">
			<div className="w-full">
				<div className="flex items-center gap-2">
					<Tabs
						tabs={topTabs}
						activeTab={activePreviewTab}
						onTabChange={setActivePreviewTab}
						variant="pills"
					/>
					<PreviewModeHelp />
				</div>

				<div className="py-6">
					{activePreviewTab === 'transaction-analysis' ? (
						<IntentSummary
							analysis={analysis}
							isLoading={isAnalysisLoading}
							error={analysisError}
						/>
					) : (
						<div className="space-y-4">
							<Overview output={output} />

							{/* Ledger Hash */}
							{ledgerTransactionHash && (
								<div className="border rounded p-3 bg-surface">
									<div className="flex items-center justify-between gap-2">
										<span className="text-sm font-medium text-muted-foreground">
											Ledger Hash:
										</span>
										<span className="font-mono text-xs break-all">
											{ledgerTransactionHash}
										</span>
									</div>
								</div>
							)}

							{/* Warning Alert */}
							<Alert variant="warning">
								<strong>Important:</strong> You should
								always validate the transaction details in
								your wallet before signing. Your wallet is
								the ultimate source of truth for what you're
								approving.
							</Alert>

							{/* Simulation Tab Navigation */}
							<div className="w-full">
								<Tabs
									tabs={tabs}
									activeTab={activeSimulationTab}
									onTabChange={setActiveSimulationTab}
									variant="pills"
								/>

								<div className="py-6">
									{activeTabData?.component()}
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
