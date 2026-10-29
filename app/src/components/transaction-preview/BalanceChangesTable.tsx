// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';

import { ShortAddress } from '@/components/invitations/ShortAddress';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { CopyButton } from '@/components/ui/CopyButton';
import { SkeletonLine } from '@/components/ui/skeleton';
import {
	tableClass,
	tableRowClass,
	tableShellHeadRowClass,
} from '@/components/ui/table';
import type { CoinDisplayData } from '@/hooks/useCoinDisplayData';
import { formatCoinType } from '@/lib/coin-type';
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

const cellClass = 'px-2 py-1.75 sm:px-3';

/** Owner, asset and signed change per row, the gas payer's net gas last. */
export function BalanceChangesTable({
	rows,
	status,
	coinData,
	isCoinDataLoading,
}: {
	rows: BalanceChangeRow[];
	status: SimulationStatus;
	coinData: Map<string, CoinDisplayData>;
	isCoinDataLoading: (coinType: string) => boolean;
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
						<th className="px-2 sm:px-3">Owner</th>
						<th className="w-24 px-2 sm:w-50 sm:px-3">
							Asset
						</th>
						<th className="w-24 px-2 text-right sm:w-40 sm:px-3">
							Change
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
									<SkeletonLine className="w-20 max-w-full" />
								</td>
								<td className={cellClass}>
									<SkeletonLine className="ml-auto w-16 max-w-full" />
								</td>
							</tr>
						))
					) : rows.length === 0 ? (
						<tr>
							<td
								colSpan={3}
								className={cn(
									cellClass,
									'py-3 text-13 text-muted-foreground',
								)}
								data-testid="transaction-preview-empty"
							>
								{status === 'failed'
									? 'No balance changes to show. The simulation stopped before the transaction finished.'
									: 'No balance changes.'}
							</td>
						</tr>
					) : (
						rows.map((row, index) => (
							<BalanceRow
								key={`${row.address}-${row.coinType}-${row.gas}-${index}`}
								row={row}
								coin={coinData.get(row.coinType)}
								loading={isCoinDataLoading(row.coinType)}
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
}: {
	row: BalanceChangeRow;
	coin: CoinDisplayData | undefined;
	loading: boolean;
}) {
	const positive = BigInt(row.amount) > 0n;
	const usd = coinUsdValue(row.amount, {
		priceUsd: coin?.priceUsd,
		decimals: coin?.decimals,
	});
	const ownerName = row.gas
		? `${row.label ?? formatAddress(row.address)} (gas)`
		: row.label;
	const showAddressLine = !row.gas || !!row.label;

	return (
		<tr
			className={tableRowClass}
			data-testid="balance-change"
			data-address={row.address}
			data-coin-type={row.coinType}
			data-amount={row.amount}
			data-gas={row.gas || undefined}
		>
			<td className={cellClass}>
				<div className="flex min-w-0 flex-col">
					{ownerName ? (
						<>
							<span className="text-13 break-words">
								{ownerName}
							</span>
							{showAddressLine && (
								<ShortAddress
									address={row.address}
									className="w-fit max-w-full truncate font-mono text-11 text-muted-foreground"
								/>
							)}
						</>
					) : (
						<ShortAddress
							address={row.address}
							className="w-fit max-w-full truncate font-mono text-13"
						/>
					)}
				</div>
			</td>
			<td className={cellClass}>
				<div className="flex min-w-0 items-center gap-2">
					<CoinIcon
						iconUrl={coin?.iconUrl}
						symbol={coin?.symbol}
						coinType={row.coinType}
						recognized={coin?.recognized}
						size="sm"
					/>
					<div className="flex min-w-0 flex-col">
						{!coin && loading ? (
							<SkeletonLine className="my-1 w-12" />
						) : (
							<span className="truncate text-13">
								{coin?.symbol ?? '—'}
							</span>
						)}
						<span className="flex min-w-0 items-center gap-1">
							<span
								className="truncate font-mono text-11 text-muted-foreground"
								title={row.coinType}
							>
								{formatCoinType(row.coinType)}
							</span>
							<CopyButton
								value={row.coinType}
								size="inline"
								successMessage="Coin type copied"
							/>
						</span>
					</div>
				</div>
			</td>
			<td className={cn(cellClass, 'text-right')}>
				{!coin && loading ? (
					<div className="flex flex-col items-end gap-1.5">
						<SkeletonLine className="w-16 max-w-full" />
						<SkeletonLine className="w-10 max-w-full" />
					</div>
				) : (
					<div className="flex flex-col items-end">
						<span
							className={cn(
								'text-13 break-all tabular-nums',
								positive && 'text-success-foreground',
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
			</td>
		</tr>
	);
}
