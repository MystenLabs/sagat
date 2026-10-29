// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CopyButton } from '@/components/ui/CopyButton';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { Notice } from '@/components/wizard/parts';
import { useNetwork } from '@/contexts/NetworkContext';
import { useCoinDisplayDataMap } from '@/hooks/useCoinDisplayData';
import {
	buildTransactionPreview,
	type NamedAccount,
	type SimulatedTransaction,
	type SimulationStatus,
} from '@/lib/transaction-preview';

import { BalanceChangesTable } from './BalanceChangesTable';
import { CommandsList } from './CommandsList';
import { DetailsTable } from './DetailsTable';
import { EventsList } from './EventsList';
import { ObjectChangesList } from './ObjectChangesList';
import { EmptyPanel, PreviewHeading } from './parts';

type TabId =
	| 'balance-changes'
	| 'object-changes'
	| 'events'
	| 'commands'
	| 'raw-json';

type ViewId = 'simulation' | 'analyzer';

/**
 * The simulation result wherever a transaction is reviewed: digest,
 * status, sender, epoch and gas, the Ledger hash, then tabs for the
 * balance and object changes, events, commands and the raw dry run, and
 * the raw bytes on demand. Everything read from the bytes shows while the
 * simulation runs. A second view shows the static analyzer instead.
 */
export function TransactionPreview({
	bytes,
	status,
	result,
	error,
	simulatedAt,
	accounts,
	actions,
	analyzer,
	analyzerCount,
}: {
	bytes: string;
	status: SimulationStatus;
	result?: SimulatedTransaction | null;
	error?: string | null;
	/** When the simulation ran, in milliseconds. */
	simulatedAt?: number | null;
	accounts?: NamedAccount[];
	/** Rendered right of the heading. */
	actions?: ReactNode;
	/** What the Static analyzer view shows. */
	analyzer: ReactNode;
	/** The analyzer's issues, badged on its tab. */
	analyzerCount?: number;
}) {
	const { network } = useNetwork();
	const model = useMemo(
		() =>
			buildTransactionPreview({
				bytes,
				status,
				result,
				error,
				network,
				simulatedAt:
					simulatedAt == null
						? null
						: new Date(simulatedAt),
				accounts,
			}),
		[
			bytes,
			status,
			result,
			error,
			network,
			simulatedAt,
			accounts,
		],
	);

	// Keyed by value, so a new model with the same coins keeps the lookup.
	const coinTypesKey = [
		...new Set(
			model.balanceChanges.map((row) => row.coinType),
		),
	].join('\n');
	const coinTypes = useMemo(
		() => (coinTypesKey ? coinTypesKey.split('\n') : []),
		[coinTypesKey],
	);
	const coinData = useCoinDisplayDataMap(coinTypes);

	const [view, setView] = useState<ViewId>('simulation');
	const [activeTab, setActiveTab] = useState<TabId>(
		'balance-changes',
	);
	const [showRaw, setShowRaw] = useState(false);

	const pending = model.status === 'pending';
	const tabs: {
		id: TabId;
		label: string;
		count?: number;
	}[] = [
		{
			id: 'balance-changes',
			label: 'Balance changes',
			count: model.balanceChanges.length,
		},
		{
			id: 'object-changes',
			label: 'Object changes',
			count: model.objectChanges.length,
		},
		{
			id: 'events',
			label: 'Events',
			count: model.events.length,
		},
		{
			id: 'commands',
			label: 'Commands',
			count: model.transaction.commands.length,
		},
		{ id: 'raw-json', label: 'Raw JSON' },
	];

	const senderAddress = model.sender?.address;
	const waiting = <EmptyPanel>Simulating…</EmptyPanel>;

	let panel: ReactNode;
	switch (activeTab) {
		case 'balance-changes':
			panel = (
				<BalanceChangesTable
					rows={model.balanceChanges}
					status={model.status}
					coinData={coinData.map}
					isCoinDataLoading={coinData.isLoadingFor}
				/>
			);
			break;
		case 'object-changes':
			panel = pending ? (
				waiting
			) : (
				<ObjectChangesList
					objects={model.objectChanges}
					objectTypes={model.objectTypes}
					senderAddress={senderAddress}
				/>
			);
			break;
		case 'events':
			panel = pending ? (
				waiting
			) : (
				<EventsList
					events={model.events}
					senderAddress={senderAddress}
				/>
			);
			break;
		case 'commands':
			panel = (
				<CommandsList transaction={model.transaction} />
			);
			break;
		case 'raw-json':
			panel = model.raw ? (
				<Textarea
					value={JSON.stringify(model.raw, null, 2)}
					rows={20}
					readOnly
					aria-label="Simulation result as JSON"
					className="font-mono md:text-12"
				/>
			) : (
				<EmptyPanel>
					Nothing to show until the simulation runs.
				</EmptyPanel>
			);
			break;
	}

	return (
		<section
			className="flex min-w-0 flex-col gap-4"
			data-status={model.status}
			data-testid={
				pending ? undefined : 'transaction-preview-result'
			}
			data-result={
				pending
					? undefined
					: model.status === 'passed'
						? 'success'
						: 'failure'
			}
			aria-busy={pending || undefined}
		>
			<PreviewHeading actions={actions} />

			<div className="flex items-center gap-2">
				<Tabs
					tabs={[
						{
							id: 'simulation',
							label: 'Simulation result',
						},
						{
							id: 'analyzer',
							label: 'Static analyzer',
							count: analyzerCount,
						},
					]}
					activeTab={view}
					onTabChange={(id) => setView(id as ViewId)}
					variant="pills"
					testId="transaction-preview-view"
				/>
				<ViewHelp />
			</div>

			{view === 'analyzer' ? (
				analyzer
			) : (
				<>
					<DetailsTable model={model} />

					<div
						className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted px-3.5 py-2.5"
						data-testid="transaction-preview-ledger-hash"
					>
						<span className="text-13 text-muted-foreground">
							Ledger hash
						</span>
						<span className="ml-auto flex min-w-0 items-center gap-1.5">
							<span className="min-w-0 font-mono text-12 break-all">
								{model.ledgerHash}
							</span>
							<CopyButton
								value={model.ledgerHash}
								size="inline"
								successMessage="Ledger hash copied"
							/>
						</span>
					</div>

					<Notice tone="warning">
						Always check the transaction in your wallet
						before you sign. Your wallet is the final word
						on what you approve.
					</Notice>

					<div className="flex min-w-0 flex-col gap-3">
						<Tabs
							tabs={tabs}
							activeTab={activeTab}
							onTabChange={(id) =>
								setActiveTab(id as TabId)
							}
							variant="pills"
							testId="transaction-preview-tab"
						/>
						<div data-testid="transaction-preview-panel">
							{panel}
						</div>
					</div>
				</>
			)}

			<Collapsible
				open={showRaw}
				onOpenChange={setShowRaw}
				className="flex flex-col gap-2"
			>
				<CollapsibleTrigger
					className="flex w-fit cursor-pointer items-center gap-1 rounded-sm text-12 text-foreground-secondary outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
					data-testid="transaction-preview-raw-toggle"
				>
					{showRaw
						? 'Hide raw transaction'
						: 'Show raw transaction'}
					{showRaw ? (
						<ChevronUp className="size-3" />
					) : (
						<ChevronDown className="size-3" />
					)}
				</CollapsibleTrigger>
				<CollapsibleContent>
					<Textarea
						readOnly
						value={bytes}
						aria-label="Raw transaction bytes"
						className="h-30 resize-none font-mono break-all md:text-12"
						data-testid="transaction-preview-raw"
					/>
				</CollapsibleContent>
			</Collapsible>
		</section>
	);
}

/** What the two views are, on hover. */
function ViewHelp() {
	return (
		<TooltipProvider delay={150}>
			<Tooltip>
				<TooltipTrigger
					aria-label="About the simulation and the static analyzer"
					data-testid="transaction-preview-help"
					className="flex shrink-0 cursor-pointer items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Info className="size-4" />
				</TooltipTrigger>
				<TooltipContent
					side="bottom"
					align="start"
					className="max-w-sm border bg-card text-card-foreground"
				>
					<div className="flex flex-col gap-2 text-12 leading-relaxed">
						<p>
							<span className="block font-medium">
								Simulation result
							</span>
							One dry run against the current on-chain
							state. It shows the expected effects, but it
							can miss some of what could leave the account,
							because on-chain state can change before the
							transaction runs.
						</p>
						<p>
							<span className="block font-medium">
								Static analyzer
							</span>
							Reads the transaction itself and estimates the
							most that can leave the account, not counting
							gas. It helps protect against on-chain state
							attacks.
						</p>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
