// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ChevronRight,
	RefreshCw,
	Send,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { content } from '@/content';
import { type useAccountAssets } from '@/hooks/useAccountAssets';
import { type Balance } from '@/hooks/useMultisigBalances';
import {
	coinLabels,
	type CoinDisplayData,
} from '@/lib/coinDisplay';
import {
	formatCoinAmount,
	formatUsdValue,
} from '@/lib/coins';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

import { Button, buttonVariants } from '../ui/button';
import { CardHeading } from '../ui/card';
import { CoinIcon } from '../ui/CoinIcon';
import { EmptyState, ErrorState } from '../ui/empty-state';
import { Skeleton, SkeletonRows } from '../ui/skeleton';
import { SuiLogo } from '../ui/SuiLogo';
import {
	tableClass,
	tableRowClass,
	tableShellClass,
	tableShellHeadRowClass,
} from '../ui/table';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../ui/tooltip';

/** The overview lists this many tokens; the rest are on the assets tab. */
export const TOKENS_SHOWN = 5;

/**
 * The account's largest holdings as a table: each coin with its balance,
 * its USD value as far as a price is known, and Send. SUI stays first
 * whatever its value, as on the assets tab. The heading says when prices
 * were fetched, with a refresh, and links to the assets tab.
 */
export function TokensCard({
	address,
	assets,
	onSend,
}: {
	address: string;
	assets: ReturnType<typeof useAccountAssets>;
	onSend: (coinType: string) => void;
}) {
	const rows = assets.balances.slice(0, TOKENS_SHOWN);
	const pricesUpdated =
		assets.pricesAvailable && assets.pricesUpdatedAt
			? formatDateTime(new Date(assets.pricesUpdatedAt))
			: null;

	return (
		<section
			className="flex min-w-0 flex-col gap-3"
			aria-labelledby="tokens-title"
			data-testid="tokens"
		>
			<CardHeading
				id="tokens-title"
				title={content.overview.tokens.title}
			>
				<div className="ml-auto flex items-center gap-4">
					{pricesUpdated && (
						<span className="flex items-center text-12 text-muted-foreground">
							<TooltipProvider delay={150}>
								<Tooltip>
									<TooltipTrigger
										render={
											<Button
												variant="ghost"
												size="icon-xs"
												onClick={assets.refreshPrices}
												disabled={assets.refreshingPrices}
												aria-label={
													content.overview.tokens
														.refreshPrices
												}
												data-testid="refresh-prices"
											/>
										}
									>
										<RefreshCw />
									</TooltipTrigger>
									<TooltipContent>
										{content.overview.tokens.refreshPrices}
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
							<span data-testid="prices-updated">
								{content.overview.tokens.pricesUpdated(
									pricesUpdated,
								)}
							</span>
						</span>
					)}
					<Link
						to={`/multisig/${address}/assets`}
						className={cn(
							buttonVariants({
								variant: 'ghost',
								size: 'sm',
							}),
							'-mr-2.5 gap-1 text-foreground-secondary',
						)}
						data-testid="view-all-assets"
					>
						{content.overview.tokens.viewAll}
						<ChevronRight className="size-3" />
					</Link>
				</div>
			</CardHeading>
			{assets.query.isLoading ? (
				<SkeletonRows rows={3} testId="tokens-loading" />
			) : assets.isError ? (
				// A failed background refetch keeps the loaded rows; a
				// failed later page would leave them partial.
				<ErrorState
					title={content.overview.tokens.loadFailed}
					error={assets.query.error}
					onRetry={assets.retry}
					retrying={assets.query.isFetching}
					testId="tokens-error"
				/>
			) : rows.length === 0 ? (
				<EmptyState
					icon={SuiLogo}
					iconClassName="bg-sui/10"
					title={content.overview.tokens.emptyTitle}
					description={
						content.overview.tokens.emptyDescription
					}
					testId="tokens-empty"
				/>
			) : (
				<div className={tableShellClass}>
					{/* Phones scroll the table rather than squeeze the asset. */}
					<div className="relative overflow-x-auto">
						<table className={cn(tableClass, 'min-w-140')}>
							<thead>
								<tr className={tableShellHeadRowClass}>
									<th className="px-3">
										{content.overview.tokens.asset}
									</th>
									<th className="w-36 px-3 text-right">
										{content.overview.tokens.balance}
									</th>
									<th className="w-36 px-3 text-right">
										{content.overview.tokens.value}
									</th>
									<th className="w-28 px-3">
										<span className="sr-only">
											{content.overview.tokens.actions}
										</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((balance) => (
									<TokenRow
										key={balance.coinType}
										balance={balance}
										coinData={assets.coinData.get(
											balance.coinType,
										)}
										usd={assets.usdValue(balance)}
										isLoading={assets.isCoinDataLoadingFor(
											balance.coinType,
										)}
										onSend={() => onSend(balance.coinType)}
									/>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</section>
	);
}

function TokenRow({
	balance,
	coinData,
	usd,
	isLoading,
	onSend,
}: {
	balance: Balance;
	coinData: CoinDisplayData | undefined;
	usd: number | null;
	isLoading: boolean;
	onSend: () => void;
}) {
	const decimals = coinData?.decimals;
	const { symbol, name } = coinLabels(
		balance.coinType,
		coinData,
	);
	return (
		<tr
			className={cn(tableRowClass, 'h-12.5')}
			data-testid="token-row"
			data-coin-type={balance.coinType}
			data-balance={balance.balance}
		>
			<td className="px-3 py-1.5">
				<div className="flex min-w-0 items-center gap-2.5">
					<CoinIcon
						iconUrl={coinData?.iconUrl}
						symbol={coinData?.symbol}
						coinType={balance.coinType}
						recognized={coinData?.recognized}
						size="md"
						className="shrink-0"
					/>
					<div className="flex min-w-0 flex-col">
						<span className="truncate text-14 font-medium">
							{symbol}
						</span>
						{name !== symbol && (
							<span className="truncate text-12 text-muted-foreground">
								{name}
							</span>
						)}
					</div>
				</div>
			</td>
			<td
				className="px-3 py-1.5 text-right tabular-nums"
				data-testid="token-balance"
			>
				{decimals != null ? (
					formatCoinAmount(balance.balance, decimals)
				) : isLoading ? (
					<Skeleton className="ml-auto h-4 w-16" />
				) : (
					// Without its decimals the raw amount would mislead.
					<span
						className="text-muted-foreground"
						title={content.assets.row.rawAmount(
							balance.balance,
						)}
					>
						—
					</span>
				)}
			</td>
			<td
				className="px-3 py-1.5 text-right font-medium tabular-nums"
				data-testid="token-value"
			>
				{usd != null ? (
					formatUsdValue(usd)
				) : (
					<span className="font-normal text-muted-foreground">
						—
					</span>
				)}
			</td>
			<td className="px-3 py-1.5 text-right">
				{/* Without the coin's decimals the wizard can't take an amount. */}
				<Button
					variant="outline"
					size="sm"
					onClick={onSend}
					disabled={decimals == null}
					data-testid="token-send-button"
				>
					<Send />
					{content.overview.tokens.send}
				</Button>
			</td>
		</tr>
	);
}
