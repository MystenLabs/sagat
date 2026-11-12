// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';

import { VerifiedMark } from '@/components/assets/CoinMarks';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { CopyButton } from '@/components/ui/CopyButton';
import { SkeletonLine } from '@/components/ui/skeleton';
import {
	tableClass,
	tableRowClass,
	tableShellHeadRowClass,
} from '@/components/ui/table';
import { content } from '@/content';
import type { CoinDisplayData } from '@/hooks/useCoinDisplayData';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatType } from '@/lib/coin-type';
import {
	coinUsdValue,
	formatCoinAmount,
	formatUsdValue,
} from '@/lib/coins';
import type {
	BalanceChangeRow,
	SimulationStatus,
} from '@/lib/transaction-preview';
import { cn } from '@/lib/utils';

const COPY = content.transactionPreview.balances;

const cellClass = 'px-2 py-1.75 sm:px-3';

/** Owner, address and asset beside each signed change, the gas payer's net gas last. */
export function BalanceChangesTable({
	rows,
	status,
	coinData,
	isCoinDataLoading,
	isVerified,
}: {
	rows: BalanceChangeRow[];
	status: SimulationStatus;
	coinData: Map<string, CoinDisplayData>;
	isCoinDataLoading: (coinType: string) => boolean;
	isVerified: (coinType: string) => boolean | undefined;
}) {
	return (
		<div className="overflow-hidden rounded-lg border bg-card">
			<table className={tableClass}>
				<thead>
					<tr
						className={cn(
							tableShellHeadRowClass,
							'text-12',
						)}
					>
						<th className="px-2 sm:px-3">
							{content.common.fields.owner}
						</th>
						<th className="w-24 px-2 text-right sm:w-40 sm:px-3">
							{COPY.change}
						</th>
					</tr>
				</thead>
				<tbody>
					{status === 'pending' ? (
						[0, 1, 2].map((i) => (
							<tr key={i} className={tableRowClass}>
								<td className={cellClass}>
									<SkeletonLine className="w-28 max-w-full" />
								</td>
								<td className={cellClass}>
									<SkeletonLine className="ml-auto w-16 max-w-full" />
								</td>
							</tr>
						))
					) : rows.length === 0 ? (
						<tr>
							<td
								colSpan={2}
								className={cn(
									cellClass,
									'py-3 text-13 text-muted-foreground',
								)}
								data-testid="transaction-preview-empty"
							>
								{status === 'failed'
									? COPY.emptyFailed
									: COPY.empty}
							</td>
						</tr>
					) : (
						rows.map((row, index) => (
							<BalanceRow
								key={`${row.address}-${row.coinType}-${row.gas}-${index}`}
								row={row}
								coin={coinData.get(row.coinType)}
								loading={isCoinDataLoading(row.coinType)}
								verified={isVerified(row.coinType)}
							/>
						))
					)}
				</tbody>
			</table>
		</div>
	);
}

function BalanceRow({
	row,
	coin,
	loading,
	verified,
}: {
	row: BalanceChangeRow;
	coin: CoinDisplayData | undefined;
	loading: boolean;
	verified: boolean | undefined;
}) {
	const amount = BigInt(row.amount);
	const positive = amount > 0n;
	const negative = amount < 0n;
	const usd = coinUsdValue(row.amount, {
		priceUsd: coin?.priceUsd,
		decimals: coin?.decimals,
	});
	const ownerName = row.gas
		? COPY.gasOwner(row.label ?? formatAddress(row.address))
		: row.label;
	// From `sm` an unverified coin has the chip, below it the icon's badge.
	const chip =
		useMediaQuery('(min-width: 40rem)') &&
		verified === false;

	return (
		<tr
			className={tableRowClass}
			data-testid="balance-change"
			data-address={row.address}
			data-coin-type={row.coinType}
			data-amount={row.amount}
			data-gas={row.gas || undefined}
		>
			<td
				colSpan={2}
				className="px-2 pt-2.25 pb-2.5 sm:px-3"
			>
				<div className="flex items-start">
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						{ownerName && (
							<span className="text-13 break-words">
								{ownerName}
							</span>
						)}
						<span
							className={cn(
								'font-mono text-11 break-all',
								ownerName && 'text-muted-foreground',
							)}
						>
							{row.address}
						</span>
					</div>
					{/* The Change header's width less its padding, so amounts line up under it. */}
					<div className="w-20 shrink-0 pl-2 text-right sm:w-34 sm:pl-3">
						{!coin && loading ? (
							<div className="flex flex-col items-end gap-1.5">
								<SkeletonLine className="w-16 max-w-full" />
								<SkeletonLine className="w-10 max-w-full" />
							</div>
						) : (
							<div className="flex flex-col items-end gap-0.5">
								<span
									className={cn(
										'text-13 break-all tabular-nums',
										positive && 'text-success-foreground',
										negative && 'text-error-foreground',
									)}
								>
									{coin?.decimals != null
										? `${positive ? '+' : ''}${formatCoinAmount(row.amount, coin.decimals)}`
										: '—'}
								</span>
								{usd !== null && (
									<span className="text-12 text-muted-foreground tabular-nums">
										{formatUsdValue(usd)}
									</span>
								)}
							</div>
						)}
					</div>
				</div>
				<div className="mt-1.5 flex min-w-0 items-center gap-2">
					<CoinIcon
						iconUrl={coin?.iconUrl}
						symbol={coin?.symbol}
						coinType={row.coinType}
						recognized={coin?.recognized}
						badge={false}
						verified={chip ? undefined : verified}
						size="xs"
					/>
					<div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
						{!coin && loading ? (
							<SkeletonLine className="my-1 w-12" />
						) : (
							<span className="flex min-w-0 items-center gap-1.5">
								<span className="truncate text-13 text-foreground-secondary">
									{coin?.symbol ?? '—'}
								</span>
								{chip && <VerifiedMark verified={false} />}
							</span>
						)}
						<span className="flex max-w-full min-w-0 items-center gap-1">
							<span
								className="truncate font-mono text-11 text-muted-foreground"
								title={row.coinType}
							>
								{formatType(row.coinType)}
							</span>
							<CopyButton
								value={row.coinType}
								size="inline"
								successMessage={
									content.toasts.coinTypeCopied
								}
							/>
						</span>
					</div>
				</div>
			</td>
		</tr>
	);
}
