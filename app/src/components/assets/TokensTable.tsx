// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ChevronRight,
	CircleCheck,
	RefreshCw,
	Send,
} from 'lucide-react';
import { useState } from 'react';

import { content } from '@/content';
import { type useAccountAssets } from '@/hooks/useAccountAssets';
import { type Balance } from '@/hooks/useMultisigBalances';
import { formatType } from '@/lib/coin-type';
import {
	coinLabels,
	sameCoinLabel,
	type CoinDisplayData,
} from '@/lib/coinDisplay';
import {
	formatCoinAmount,
	formatUsdValue,
} from '@/lib/coins';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

import { Button } from '../ui/button';
import { Chip } from '../ui/chip';
import { CoinIcon } from '../ui/CoinIcon';
import { CopyButton } from '../ui/CopyButton';
import { EmptyState, ErrorState } from '../ui/empty-state';
import { Skeleton, SkeletonRows } from '../ui/skeleton';
import { SuiLogo } from '../ui/SuiLogo';
import {
	tableClass,
	tableHeadRowClass,
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

const FIELDS = content.common.fields;
const COPY = content.assets.tokens;

type AccountAssets = ReturnType<typeof useAccountAssets>;

/** The overview lists this many tokens; the rest are on the assets page. */
export const TOKENS_SHOWN = 5;

/**
 * Where the tokens table sits. The overview shows the largest holdings in
 * a bordered shell; the assets page shows every token in its card, with
 * the price, and keeps unverified ones in a group of their own.
 */
export type TokensTableVariant = 'overview' | 'assets';

/**
 * The account's coins as a table: each with its balance, its USD value as
 * far as a price is known, and Send. Verified coins (SUI and the
 * registry's) carry a check, the rest an Unverified chip, once the
 * registry is known; without it neither shows. Test ids are
 * `testId` plus `-table`, `-loading`, `-error` and `-empty`.
 */
export function TokensTable({
	assets,
	variant,
	onSend,
	testId,
}: {
	assets: AccountAssets;
	variant: TokensTableVariant;
	onSend: (coinType: string) => void;
	testId: string;
}) {
	const full = variant === 'assets';
	const [unverifiedOpen, setUnverifiedOpen] =
		useState(false);

	// Both wait for the registry, so no coin is marked before it is known;
	// the assets page waits for every page too, so its split is final.
	const loading =
		(full ? assets.isLoading : assets.query.isLoading) ||
		assets.verifiedLoading;
	if (loading)
		return (
			<SkeletonRows
				rows={3}
				className={cn(full && 'rounded-lg')}
				testId={`${testId}-loading`}
			/>
		);
	if (assets.isError)
		// A failed background refetch keeps the loaded rows; a failed
		// later page would leave them partial.
		return (
			<ErrorState
				title={content.common.states.balancesLoadFailed}
				error={assets.query.error}
				onRetry={assets.retry}
				retrying={assets.query.isFetching}
				testId={`${testId}-error`}
			/>
		);
	if (assets.balances.length === 0)
		return (
			<EmptyState
				icon={SuiLogo}
				iconClassName="bg-sui/10"
				title={COPY.emptyTitle}
				testId={`${testId}-empty`}
			/>
		);

	// Without the registry no coin is marked or grouped: all in one list.
	const known = assets.verifiedKnown;
	const verified = (coinType: string) =>
		known ? assets.isVerified(coinType) : undefined;
	const listed = full
		? assets.balances
		: assets.balances.slice(0, TOKENS_SHOWN);
	const split = full && known;
	const rows = split
		? listed.filter((b) => assets.isVerified(b.coinType))
		: listed;
	const unverified = split
		? listed.filter((b) => !assets.isVerified(b.coinType))
		: [];
	const columns = full ? 5 : 4;

	const row = (balance: Balance) => (
		<TokenRow
			key={balance.coinType}
			balance={balance}
			coinData={assets.coinData.get(balance.coinType)}
			verified={verified(balance.coinType)}
			usd={assets.usdValue(balance)}
			isLoading={assets.isCoinDataLoadingFor(
				balance.coinType,
			)}
			showPrice={full}
			onSend={() => onSend(balance.coinType)}
		/>
	);

	return (
		<div
			className={cn(!full && tableShellClass)}
			data-testid={`${testId}-table`}
		>
			{/* Phones show the asset and its balance and scroll to the rest.
			    They lay the table out by content: a fixed layout leaves the
			    hidden price column's share empty. */}
			<div className="relative overflow-x-auto">
				<table
					className={cn(
						tableClass,
						'max-sm:w-max max-sm:table-auto',
						full ? 'sm:min-w-160' : 'sm:min-w-140',
					)}
				>
					<thead>
						<tr
							className={
								full
									? tableHeadRowClass
									: tableShellHeadRowClass
							}
						>
							<th className="px-3 max-sm:w-48">
								{FIELDS.asset}
							</th>
							<th className="w-36 px-3 text-right max-sm:w-29">
								{FIELDS.balance}
							</th>
							{/* Phones leave the price out, so less scrolls. */}
							{full && (
								<th className="hidden w-28 px-3 text-right sm:table-cell">
									{COPY.price}
								</th>
							)}
							<th className="w-36 px-3 text-right">
								{COPY.value}
							</th>
							<th className="w-28 px-3">
								<span className="sr-only">
									{FIELDS.actions}
								</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map(row)}
						{unverified.length > 0 && (
							<tr className={tableRowClass}>
								<td
									colSpan={columns}
									className="px-1 py-1.5"
								>
									<button
										type="button"
										className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-14 text-foreground-secondary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
										aria-expanded={unverifiedOpen}
										onClick={() =>
											setUnverifiedOpen((open) => !open)
										}
										data-testid="unverified-tokens-toggle"
										data-count={unverified.length}
									>
										<ChevronRight
											className={cn(
												'size-3.5 transition-transform',
												unverifiedOpen && 'rotate-90',
											)}
										/>
										{COPY.unverifiedTokens}
										<span className="text-12 text-muted-foreground">
											{unverified.length}
										</span>
									</button>
								</td>
							</tr>
						)}
						{unverifiedOpen && unverified.map(row)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

/** "Prices updated …" with a refresh, beside a tokens heading. */
export function PricesUpdated({
	assets,
}: {
	assets: AccountAssets;
}) {
	const updated =
		assets.pricesAvailable && assets.pricesUpdatedAt
			? formatDateTime(new Date(assets.pricesUpdatedAt))
			: null;
	if (!updated) return null;
	return (
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
								aria-label={COPY.refreshPrices}
								data-testid="refresh-prices"
							/>
						}
					>
						<RefreshCw />
					</TooltipTrigger>
					<TooltipContent>
						{COPY.refreshPrices}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<span data-testid="prices-updated">
				{COPY.pricesUpdated(updated)}
			</span>
		</span>
	);
}

function TokenRow({
	balance,
	coinData,
	verified,
	usd,
	isLoading,
	showPrice,
	onSend,
}: {
	balance: Balance;
	coinData: CoinDisplayData | undefined;
	/** Undefined while the registry isn't known: neither mark shows. */
	verified: boolean | undefined;
	usd: number | null;
	isLoading: boolean;
	showPrice: boolean;
	onSend: () => void;
}) {
	const decimals = coinData?.decimals;
	const { symbol, name } = coinLabels(
		balance.coinType,
		coinData,
	);
	const priceUsd = coinData?.priceUsd;
	return (
		<tr
			className={cn(tableRowClass, 'h-15')}
			data-testid="token-row"
			data-coin-type={balance.coinType}
			data-balance={balance.balance}
			data-verified={verified}
		>
			<td className="px-3 py-2">
				<div className="flex min-w-0 items-center gap-2.5">
					<CoinIcon
						iconUrl={coinData?.iconUrl}
						symbol={coinData?.symbol}
						coinType={balance.coinType}
						recognized={coinData?.recognized}
						badge={false}
						size="md"
						className="shrink-0"
					/>
					{/* The name and type take what the symbol leaves and
					    truncate: they add nothing to the column's width. */}
					<div className="flex min-w-0 grow flex-col gap-0.5">
						<div className="flex min-w-0 items-center gap-1.5">
							<span className="shrink-0 text-14 font-medium whitespace-nowrap">
								{symbol}
							</span>
							{verified === true && (
								<CircleCheck
									className="size-3.5 shrink-0 fill-foreground text-background"
									role="img"
									aria-label={COPY.verified}
									data-testid="token-verified"
								/>
							)}
							{verified === false && (
								<Chip
									variant="warning"
									size="sm"
									data-testid="token-unverified"
								>
									{COPY.unverified}
								</Chip>
							)}
							{!sameCoinLabel(symbol, name) && (
								<span className="grow truncate text-12 text-muted-foreground contain-inline-size">
									{name}
								</span>
							)}
						</div>
						<span className="flex min-w-0 items-center gap-1 contain-inline-size">
							<span
								className="truncate font-mono text-11 text-muted-foreground"
								title={balance.coinType}
							>
								{formatType(balance.coinType)}
							</span>
							<CopyButton
								value={balance.coinType}
								size="inline"
								successMessage={
									content.toasts.coinTypeCopied
								}
								data-testid="token-copy-type"
							/>
						</span>
					</div>
				</div>
			</td>
			<td
				className="px-3 py-2 text-right tabular-nums"
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
						title={COPY.rawAmount(balance.balance)}
					>
						—
					</span>
				)}
			</td>
			{showPrice && (
				<td
					className="hidden px-3 py-2 text-right text-muted-foreground tabular-nums sm:table-cell"
					data-testid="token-price"
				>
					{verified === false
						? COPY.noPrice
						: priceUsd != null
							? formatUsdValue(priceUsd)
							: '—'}
				</td>
			)}
			<td
				className="px-3 py-2 text-right font-medium tabular-nums"
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
			<td className="px-3 py-2 text-right">
				{/* Without the coin's decimals the wizard can't take an amount. */}
				<Button
					variant="outline"
					size="sm"
					onClick={onSend}
					disabled={decimals == null}
					data-testid="token-send-button"
				>
					<Send />
					{content.common.actions.send}
				</Button>
			</td>
		</tr>
	);
}
