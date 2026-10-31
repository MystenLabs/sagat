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
import { content } from '@/content';
import { useNetwork } from '@/contexts/NetworkContext';
import { useCoinDisplayDataMap } from '@/hooks/useCoinDisplayData';
import {
	buildTransactionPreview,
	type NamedAccount,
	type PreviewSource,
	type SimulatedTransaction,
	type SimulationStatus,
} from '@/lib/transaction-preview';

import { BalanceChangesTable } from './BalanceChangesTable';
import { CommandsList } from './CommandsList';
import { DetailsTable } from './DetailsTable';
import { EventsList } from './EventsList';
import { ObjectChangesList } from './ObjectChangesList';
import { EmptyPanel, PreviewHeading } from './parts';

const COPY = content.transactionPreview;

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
	source = 'simulation',
	signingNotice = true,
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
	/** 'chain' shows an executed transaction: "Succeeded" on the chip, the confirmation time beside it, and no note about signing. */
	source?: PreviewSource;
	/** Whether the viewer is about to sign; hides the wallet notice when not. */
	signingNotice?: boolean;
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
				source,
			}),
		[
			bytes,
			status,
			result,
			error,
			network,
			simulatedAt,
			accounts,
			source,
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
			label: COPY.tabs.balanceChanges,
			count: model.balanceChanges.length,
		},
		{
			id: 'object-changes',
			label: COPY.tabs.objectChanges,
			count: model.objectChanges.length,
		},
		{
			id: 'events',
			label: COPY.tabs.events,
			count: model.events.length,
		},
		{
			id: 'commands',
			label: COPY.tabs.commands,
			count: model.transaction.commands.length,
		},
		{
			id: 'raw-json',
			label: COPY.tabs.rawJson,
		},
	];

	const senderAddress = model.sender?.address;
	const waiting = (
		<EmptyPanel>{COPY.status[source].pending}</EmptyPanel>
	);

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
					aria-label={COPY.rawJsonAriaLabel}
					className="font-mono md:text-12"
				/>
			) : (
				<EmptyPanel>{COPY.rawJsonEmpty}</EmptyPanel>
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
							label:
								source === 'chain'
									? COPY.views.chain
									: COPY.views.simulation,
						},
						{
							id: 'analyzer',
							label: COPY.views.analyzer,
							count: analyzerCount,
						},
					]}
					activeTab={view}
					onTabChange={(id) => setView(id as ViewId)}
					variant="pills"
					testId="transaction-preview-view"
				/>
				<ViewHelp source={source} />
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
							{COPY.ledgerHash}
						</span>
						<span className="ml-auto flex min-w-0 items-center gap-1.5">
							<span className="min-w-0 font-mono text-12 break-all">
								{model.ledgerHash}
							</span>
							<CopyButton
								value={model.ledgerHash}
								size="inline"
								successMessage={
									content.toasts.ledgerHashCopied
								}
							/>
						</span>
					</div>

					{source === 'simulation' && signingNotice && (
						<Notice tone="warning">
							{COPY.signingNotice}
						</Notice>
					)}

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
					{showRaw ? COPY.hideRaw : COPY.showRaw}
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
						aria-label={COPY.rawBytesAriaLabel}
						className="h-30 resize-none font-mono break-all md:text-12"
						data-testid="transaction-preview-raw"
					/>
				</CollapsibleContent>
			</Collapsible>
		</section>
	);
}

/** What the two views are, on hover. */
function ViewHelp({ source }: { source: PreviewSource }) {
	return (
		<TooltipProvider delay={150}>
			<Tooltip>
				<TooltipTrigger
					aria-label={COPY.help.ariaLabel}
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
						{source === 'chain' ? (
							<p>
								<span className="block font-medium">
									{COPY.views.chain}
								</span>
								{COPY.help.chain}
							</p>
						) : (
							<p>
								<span className="block font-medium">
									{COPY.views.simulation}
								</span>
								{COPY.help.simulation}
							</p>
						)}
						<p>
							<span className="block font-medium">
								{COPY.views.analyzer}
							</span>
							{COPY.help.analyzer}
						</p>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
