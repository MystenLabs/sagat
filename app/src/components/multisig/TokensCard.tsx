// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

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
import { cn } from '@/lib/utils';

import { buttonVariants } from '../ui/button';
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

/** The overview lists this many tokens; the rest are on the assets tab. */
export const TOKENS_SHOWN = 5;

/**
 * The account's largest holdings as a table: each coin with its balance
 * and USD value, as far as a price is known. SUI stays first whatever its
 * value, as on the assets tab. Links to the assets tab for the full list.
 */
export function TokensCard({
	address,
	assets,
}: {
	address: string;
	assets: ReturnType<typeof useAccountAssets>;
}) {
	const rows = assets.balances.slice(0, TOKENS_SHOWN);

	return (
		<section
			className="flex min-w-0 flex-col gap-3"
			aria-labelledby="tokens-title"
			data-testid="tokens"
		>
			<CardHeading id="tokens-title" title="Tokens">
				<Link
					to={`/multisig/${address}/assets`}
					className={cn(
						buttonVariants({
							variant: 'ghost',
							size: 'sm',
						}),
						'ml-auto',
					)}
					data-testid="view-all-assets"
				>
					<ChevronRight />
					View all assets
				</Link>
			</CardHeading>
			{assets.query.isLoading ? (
				<SkeletonRows rows={3} testId="tokens-loading" />
			) : assets.isError ? (
				// A failed background refetch keeps the loaded rows; a
				// failed later page would leave them partial.
				<ErrorState
					title="Failed to load balances"
					error={assets.query.error}
					onRetry={assets.retry}
					retrying={assets.query.isFetching}
					testId="tokens-error"
				/>
			) : rows.length === 0 ? (
				<EmptyState
					icon={SuiLogo}
					iconClassName="bg-sui/10"
					title="No balances yet"
					description="Once the account receives funds they show up here."
					testId="tokens-empty"
				/>
			) : (
				<div className={tableShellClass}>
					<table className={tableClass}>
						<thead>
							<tr className={tableShellHeadRowClass}>
								<th className="px-3">Asset</th>
								<th className="w-26 px-3 text-right sm:w-30">
									Balance
								</th>
								<th className="w-24 px-3 text-right sm:w-30">
									Value
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
								/>
							))}
						</tbody>
					</table>
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
}: {
	balance: Balance;
	coinData: CoinDisplayData | undefined;
	usd: number | null;
	isLoading: boolean;
}) {
	const decimals = coinData?.decimals;
	const { symbol, name } = coinLabels(
		balance.coinType,
		coinData,
	);
	return (
		<tr
			className={tableRowClass}
			data-testid="token-row"
			data-coin-type={balance.coinType}
			data-balance={balance.balance}
		>
			<td className="px-3 py-2.5">
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
				className="px-3 py-2.5 text-right tabular-nums"
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
						title={`${balance.balance} (raw)`}
					>
						—
					</span>
				)}
			</td>
			<td
				className="px-3 py-2.5 text-right font-medium tabular-nums"
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
		</tr>
	);
}
