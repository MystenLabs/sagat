// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	BalanceFlowsResult,
	TransactionAnalysisIssue,
} from '@mysten/wallet-sdk';
import { useMemo } from 'react';

import { useCoinDisplayDataMap } from '../../hooks/useCoinDisplayData';
import type { TransactionAnalysis } from '../../hooks/useTransactionAnalysis';
import {
	coinUsdValue,
	formatCoinAmount,
	formatUsdValue,
} from '../../lib/coins';
import { cn } from '../../lib/utils';
import { Alert } from '../ui/Alert';
import { CoinIcon } from '../ui/CoinIcon';
import { Label } from '../ui/label';
import { ObjectLink } from './ObjectLink';
import { PreviewCard } from './PreviewCard';
import { formatCoinType } from './utils';

type Flow = BalanceFlowsResult['sender'][number];
type AccessLevel = 'read' | 'mutate' | 'transfer';

interface IntentSummaryProps {
	analysis?: TransactionAnalysis;
	isLoading?: boolean;
	error?: Error | null;
	className?: string;
}

type Section<T> = {
	result?: T;
	issues?: TransactionAnalysisIssue[];
};

function sectionResult<T>(
	section?: Section<T>,
): T | undefined {
	return section && 'result' in section
		? section.result
		: undefined;
}

function accessVariant(level: AccessLevel) {
	if (level === 'transfer') return 'error';
	if (level === 'mutate') return 'warning';
	return 'neutral';
}

function collectIssues(
	analysis: TransactionAnalysis | undefined,
): TransactionAnalysisIssue[] {
	if (!analysis) return [];

	const issues = new Map<
		string,
		TransactionAnalysisIssue
	>();
	for (const issue of analysis.issues) {
		issues.set(issue.message, issue);
	}
	for (const section of [
		analysis.commands,
		analysis.accessLevel,
		analysis.balanceFlows,
	]) {
		for (const issue of section.issues ?? []) {
			issues.set(issue.message, issue);
		}
	}

	return Array.from(issues.values());
}

function FlowRow({
	flow,
	isCoinDataLoading,
	coinDataMap,
}: {
	flow: Flow;
	isCoinDataLoading: boolean;
	coinDataMap: ReturnType<
		typeof useCoinDisplayDataMap
	>['map'];
}) {
	const coinData = coinDataMap.get(flow.coinType);
	const rawAmount = flow.amount.toString();
	const isPositive = flow.amount > 0n;
	const formattedAmount =
		coinData?.decimals != null
			? `${isPositive ? '+' : ''}${formatCoinAmount(
					rawAmount,
					coinData.decimals,
				)}`
			: `${isPositive ? '+' : ''}${rawAmount}`;
	const usdValue = coinUsdValue(rawAmount, {
		priceUsd: coinData?.priceUsd,
		decimals: coinData?.decimals,
	});

	return (
		<div className="flex items-center justify-between gap-3 rounded-md bg-surface border p-3">
			<div className="flex items-center gap-3 min-w-0">
				<CoinIcon
					iconUrl={coinData?.iconUrl}
					symbol={coinData?.symbol}
					coinType={flow.coinType}
					recognized={coinData?.recognized}
					size="sm"
				/>
				<div className="min-w-0">
					<div
						className={cn(
							'font-medium text-sm tabular-nums',
							isPositive
								? 'text-success-foreground'
								: 'text-error-foreground',
						)}
					>
						{formattedAmount}
						{coinData?.symbol && (
							<span className="ml-1 text-xs text-muted-foreground uppercase tracking-wide">
								{coinData.symbol}
							</span>
						)}
					</div>
					<div className="text-xs text-muted-foreground truncate">
						{isCoinDataLoading && !coinData
							? 'Loading coin metadata...'
							: formatCoinType(flow.coinType)}
					</div>
				</div>
			</div>
			{usdValue != null && (
				<span className="text-xs text-muted-foreground tabular-nums shrink-0">
					{usdValue >= 0 ? '+' : ''}
					{formatUsdValue(usdValue)}
				</span>
			)}
		</div>
	);
}

function FlowGroup({
	title,
	flows,
	isCoinDataLoading,
	coinDataMap,
}: {
	title: string;
	flows: Flow[];
	isCoinDataLoading: boolean;
	coinDataMap: ReturnType<
		typeof useCoinDisplayDataMap
	>['map'];
}) {
	if (flows.length === 0) return null;

	return (
		<div className="space-y-2">
			<div className="text-sm font-medium text-muted-foreground">
				{title}
			</div>
			<div className="space-y-2">
				{flows.map((flow, index) => (
					<FlowRow
						key={`${title}-${flow.coinType}-${flow.amount.toString()}-${index}`}
						flow={flow}
						isCoinDataLoading={isCoinDataLoading}
						coinDataMap={coinDataMap}
					/>
				))}
			</div>
		</div>
	);
}

export function IntentSummary({
	analysis,
	isLoading,
	error,
	className,
}: IntentSummaryProps) {
	const balanceFlows = sectionResult<BalanceFlowsResult>(
		analysis?.balanceFlows,
	);
	const commands = sectionResult(analysis?.commands);
	const accessLevels = sectionResult<
		Record<string, AccessLevel>
	>(analysis?.accessLevel);
	const issues = useMemo(
		() => collectIssues(analysis),
		[analysis],
	);
	const senderFlows = useMemo(
		() =>
			(balanceFlows?.sender ?? []).filter(
				(flow) => flow.amount !== 0n,
			),
		[balanceFlows?.sender],
	);
	const sponsorFlows = useMemo(
		() =>
			(balanceFlows?.sponsor ?? []).filter(
				(flow) => flow.amount !== 0n,
			),
		[balanceFlows?.sponsor],
	);
	const allFlows = useMemo(
		() => [...senderFlows, ...sponsorFlows],
		[senderFlows, sponsorFlows],
	);
	const coinTypes = useMemo(
		() =>
			Array.from(
				new Set(allFlows.map((flow) => flow.coinType)),
			),
		[allFlows],
	);
	const { map: coinDataMap, isLoading: isCoinDataLoading } =
		useCoinDisplayDataMap(coinTypes);

	const commandCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const command of commands ?? []) {
			counts.set(
				command.$kind,
				(counts.get(command.$kind) ?? 0) + 1,
			);
		}
		return Array.from(counts.entries());
	}, [commands]);

	const accessEntries = Object.entries(accessLevels ?? {});
	const accessCounts = accessEntries.reduce(
		(acc, [, level]) => {
			acc[level] += 1;
			return acc;
		},
		{ read: 0, mutate: 0, transfer: 0 } satisfies Record<
			AccessLevel,
			number
		>,
	);
	const elevatedAccess = accessEntries.filter(
		([, level]) => level !== 'read',
	);

	if (!isLoading && !analysis && !error) return null;

	return (
		<PreviewCard.Root className={className}>
			<PreviewCard.Header>
				<div className="flex items-center justify-between gap-3">
					<div className="font-medium">Intent Analysis</div>
					<Label variant="neutral" size="sm">
						Advisory
					</Label>
				</div>
			</PreviewCard.Header>
			<PreviewCard.Body>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">
						Analyzing transaction intent...
					</p>
				) : error ? (
					<Alert variant="warning">
						Transaction analyzer unavailable:{' '}
						{error.message}
					</Alert>
				) : (
					<div className="space-y-4">
						{senderFlows.length > 0 ||
						sponsorFlows.length > 0 ? (
							<div className="space-y-4">
								<FlowGroup
									title="Sender asset movement"
									flows={senderFlows}
									isCoinDataLoading={isCoinDataLoading}
									coinDataMap={coinDataMap}
								/>
								<FlowGroup
									title="Sponsor asset movement"
									flows={sponsorFlows}
									isCoinDataLoading={isCoinDataLoading}
									coinDataMap={coinDataMap}
								/>
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								No non-zero sender or sponsor balance
								outflows detected.
							</p>
						)}

						{issues.length > 0 && (
							<Alert
								variant="warning"
								className="space-y-2"
							>
								<div className="space-y-1">
									<div className="font-medium">
										Analyzer findings
									</div>
									{issues.slice(0, 4).map((issue) => (
										<div key={issue.message}>
											{issue.message}
										</div>
									))}
									{issues.length > 4 && (
										<div>
											+{issues.length - 4} more finding
											{issues.length - 4 === 1 ? '' : 's'}
										</div>
									)}
								</div>
							</Alert>
						)}

						<div className="grid gap-3 md:grid-cols-2">
							<div className="rounded-md bg-surface border p-3 space-y-2">
								<div className="text-sm font-medium">
									Commands
								</div>
								{commandCounts.length > 0 ? (
									<div className="flex flex-wrap gap-2">
										{commandCounts.map(([kind, count]) => (
											<Label
												key={kind}
												variant="neutral"
												size="sm"
											>
												{kind}: {count}
											</Label>
										))}
									</div>
								) : (
									<p className="text-sm text-muted-foreground">
										No command details available.
									</p>
								)}
							</div>

							<div className="rounded-md bg-surface border p-3 space-y-2">
								<div className="text-sm font-medium">
									Object Access
								</div>
								<div className="flex flex-wrap gap-2">
									<Label variant="neutral" size="sm">
										Read: {accessCounts.read}
									</Label>
									<Label variant="warning" size="sm">
										Mutate: {accessCounts.mutate}
									</Label>
									<Label variant="error" size="sm">
										Transfer: {accessCounts.transfer}
									</Label>
								</div>
								{elevatedAccess.length > 0 && (
									<div className="space-y-1 pt-1">
										{elevatedAccess
											.slice(0, 3)
											.map(([objectId, level]) => (
												<div
													key={objectId}
													className="flex items-center justify-between gap-2 text-xs"
												>
													<span className="flex min-w-0 items-center">
														<ObjectLink
															inputObject={objectId}
														/>
													</span>
													<Label
														variant={accessVariant(level)}
														size="sm"
													>
														{level}
													</Label>
												</div>
											))}
										{elevatedAccess.length > 3 && (
											<div className="text-xs text-muted-foreground">
												+{elevatedAccess.length - 3} more
												object
												{elevatedAccess.length - 3 === 1
													? ''
													: 's'}
											</div>
										)}
									</div>
								)}
							</div>
						</div>

						<p className="text-xs text-muted-foreground">
							This summary uses static analysis to estimate
							the maximum balance outflows and object access
							that the transaction can cause. Compare it
							with the simulation result and wallet review
							before signing.
						</p>
					</div>
				)}
			</PreviewCard.Body>
		</PreviewCard.Root>
	);
}
