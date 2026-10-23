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
import { CoinIcon } from '../ui/CoinIcon';
import { EmptyState, ErrorState } from '../ui/empty-state';
import { Skeleton, SkeletonRows } from '../ui/skeleton';
import { SuiLogo } from '../ui/SuiLogo';
import { tableHeadRowClass } from '../ui/table';

/** The overview lists this many tokens; the rest are on the assets tab. */
const TOKENS_SHOWN = 5;

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
			<div className="flex items-center justify-between gap-2">
				<h2
					id="tokens-title"
					className="text-16 font-medium"
				>
					Tokens
				</h2>
				<Link
					to={`/multisig/${address}/assets`}
					className={buttonVariants({
						variant: 'ghost',
						size: 'sm',
					})}
					data-testid="view-all-assets"
				>
					<ChevronRight />
					View all assets
				</Link>
			</div>
			{assets.query.isLoading ? (
				<SkeletonRows rows={3} testId="tokens-loading" />
			) : assets.query.error && !assets.query.data ? (
				// A failed background refetch keeps the loaded rows.
				<ErrorState
					title="Failed to load balances"
					error={assets.query.error}
					onRetry={() => assets.query.refetch()}
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
				<div className="overflow-hidden rounded-2xl border bg-card">
					<table className="w-full table-fixed text-13">
						<thead>
							{/* Flush in the shell, whose corners already round the band. */}
							<tr
								className={cn(
									tableHeadRowClass,
									'[&>th:first-child]:rounded-l-none [&>th:last-child]:rounded-r-none',
								)}
							>
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
									isLoading={assets.isLoading}
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
			className="border-b last:border-b-0"
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
