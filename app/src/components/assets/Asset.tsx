// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { type CoinDisplayData } from '../../hooks/useCoinDisplayData';
import { type Balance } from '../../hooks/useMultisigBalances';
import {
	coinUsdValue,
	formatCoinAmount,
	formatUsdValue,
} from '../../lib/coins';
import { cn } from '../../lib/utils';
import {
	formatCoinType,
	prettifyType,
} from '../preview-effects/utils';
import { CoinIcon } from '../ui/CoinIcon';
import { CopyButton } from '../ui/CopyButton';
import { Skeleton } from '../ui/skeleton';

interface AssetBodyProps {
	balance: Balance;
	coinData: CoinDisplayData | undefined;
	actions?: ReactNode;
	showCopyButton?: boolean;
}

interface AssetWrapperProps extends AssetBodyProps {
	selected?: boolean;
	bare?: boolean;
	className?: string;
}

const containerClasses = (
	bare: boolean,
	selected: boolean,
	className?: string,
) =>
	cn(
		'rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover',
		!bare && 'bg-card border',
		selected && 'bg-row-selected',
		className,
	);

export function AssetRow({
	selected = false,
	bare = false,
	className,
	...body
}: AssetWrapperProps) {
	return (
		<li
			className={containerClasses(
				bare,
				selected,
				className,
			)}
		>
			<AssetBody {...body} />
		</li>
	);
}

export function AssetCard({
	selected = false,
	bare = false,
	className,
	...body
}: AssetWrapperProps) {
	return (
		<div
			className={containerClasses(
				bare,
				selected,
				className,
			)}
		>
			<AssetBody {...body} />
		</div>
	);
}

function AssetBody({
	balance,
	coinData,
	actions,
	showCopyButton = true,
}: AssetBodyProps) {
	const symbol = coinData?.symbol;
	const name = coinData?.name;
	const decimals = coinData?.decimals;
	const formatted =
		decimals != null
			? formatCoinAmount(balance.balance, decimals)
			: null;
	const usdValue = coinUsdValue(balance.balance, {
		priceUsd: coinData?.priceUsd,
		decimals,
	});
	const priceChangePct =
		coinData?.priceChange24hPercentage ?? null;
	const displayName =
		name ?? prettifyType(balance.coinType);
	const compactType = formatCoinType(balance.coinType);
	const showTypeLine = displayName !== compactType;
	const showSymbolBadge =
		!!symbol &&
		symbol.toLowerCase() !== displayName.toLowerCase();

	return (
		<div className="flex items-center gap-3">
			<CoinIcon
				iconUrl={coinData?.iconUrl}
				symbol={symbol}
				coinType={balance.coinType}
				recognized={coinData?.recognized}
				size="md"
			/>

			<div className="flex-1 min-w-0 leading-tight">
				<div className="flex items-center gap-2 min-w-0">
					<span className="font-medium text-foreground truncate text-sm">
						{displayName}
					</span>
					{showSymbolBadge && (
						<span className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">
							{symbol}
						</span>
					)}
				</div>
				{showTypeLine && (
					<div className="flex items-center gap-1.5 mt-0.5 min-w-0">
						<span
							className="font-mono text-xs text-muted-foreground truncate"
							title={balance.coinType}
						>
							{compactType}
						</span>
						{showCopyButton && (
							<CopyButton
								value={balance.coinType}
								size="xs"
								className="size-3 p-0 text-muted-foreground [&_svg]:size-2.5 hover:bg-transparent hover:text-foreground"
								successMessage="Coin type copied"
							/>
						)}
					</div>
				)}
			</div>

			<div className="text-right shrink-0 text-sm">
				{formatted ? (
					<div>
						<span
							className="font-medium tabular-nums text-foreground"
							title={`${balance.balance} (raw)`}
						>
							{formatted}
							{symbol && (
								<span className="text-xs text-muted-foreground uppercase tracking-wide ml-1.5">
									{symbol}
								</span>
							)}
						</span>
						{usdValue != null && (
							<div className="text-xs text-muted-foreground tabular-nums">
								≈ {formatUsdValue(usdValue)}
								{priceChangePct != null && (
									<span
										className={cn(
											'ml-1',
											priceChangePct >= 0
												? 'text-success-foreground'
												: 'text-error-foreground',
										)}
									>
										({priceChangePct >= 0 ? '+' : ''}
										{priceChangePct.toFixed(2)}% 24h)
									</span>
								)}
							</div>
						)}
					</div>
				) : (
					<Skeleton className="h-4 w-28 ml-auto" />
				)}
			</div>

			{actions && (
				<div className="shrink-0 flex items-center gap-2">
					{actions}
				</div>
			)}
		</div>
	);
}
