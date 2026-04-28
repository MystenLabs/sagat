// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import { useMemo } from 'react';

import { useCoinDisplayDataMap } from '../../../hooks/useCoinDisplayData';
import {
	coinUsdValue,
	formatCoinAmount,
	formatUsdValue,
} from '../../../lib/coins';
import { CoinIcon } from '../../ui/CoinIcon';
import { CopyButton } from '../../ui/CopyButton';
import { Skeleton } from '../../ui/skeleton';
import { PreviewCard } from '../PreviewCard';
import { formatCoinType } from '../utils';

type CoinDataMap = ReturnType<
	typeof useCoinDisplayDataMap
>['map'];

export function BalanceChanges({
	changes,
	senderAddress,
}: {
	changes: SuiClientTypes.BalanceChange[];
	senderAddress?: string;
}) {
	const coinTypes = useMemo(
		() =>
			Array.from(
				new Set(
					changes
						.map((change) => change.coinType)
						.filter(
							(coinType): coinType is string => !!coinType,
						),
				),
			),
		[changes],
	);
	const { map: coinDataMap, isLoading } =
		useCoinDisplayDataMap(coinTypes);

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
			{changes.map((change, index) => (
				<ChangedBalance
					key={`${change.address ?? ''}-${change.coinType ?? ''}-${index}`}
					change={change}
					coinDataMap={coinDataMap}
					isCoinDataLoading={isLoading}
					senderAddress={senderAddress}
				/>
			))}
		</div>
	);
}

function ChangedBalance({
	change,
	coinDataMap,
	isCoinDataLoading,
	senderAddress,
}: {
	change: SuiClientTypes.BalanceChange;
	coinDataMap: CoinDataMap;
	isCoinDataLoading: boolean;
	senderAddress?: string;
}) {
	const coinData = change.coinType
		? coinDataMap.get(change.coinType)
		: undefined;

	const rawAmount = change.amount;
	const decimals = coinData?.decimals;

	const usdValue = coinUsdValue(rawAmount, {
		priceUsd: coinData?.priceUsd,
		decimals,
	});
	const isPositive = isAmountPositive(rawAmount);
	const formattedAmount =
		rawAmount != null && decimals != null
			? `${isPositive ? '+' : ''}${formatCoinAmount(rawAmount, decimals)}`
			: '-';

	return (
		<PreviewCard.Root>
			<PreviewCard.Body>
				<div className="flex items-center gap-3">
					<CoinIcon
						iconUrl={coinData?.iconUrl}
						symbol={coinData?.symbol}
						coinType={change.coinType}
						recognized={coinData?.recognized}
						size="md"
					/>

					<div className="flex-1 min-w-0 leading-tight">
						<div className="flex items-baseline gap-2 min-w-0">
							{isCoinDataLoading && !coinData ? (
								<Skeleton className="h-4 w-20" />
							) : (
								<>
									<span
										className={`font-medium tabular-nums text-sm ${
											isPositive
												? 'text-success-foreground'
												: 'text-error-foreground'
										}`}
									>
										{formattedAmount}
									</span>
									{coinData?.symbol && (
										<span className="text-xs text-muted-foreground uppercase tracking-wide">
											{coinData.symbol}
										</span>
									)}
									{usdValue != null && (
										<span className="text-xs text-muted-foreground tabular-nums">
											({usdValue >= 0 ? '+' : ''}
											{formatUsdValue(usdValue)})
										</span>
									)}
								</>
							)}
						</div>
						{change.coinType && (
							<div className="flex items-center gap-1.5 mt-0.5 min-w-0">
								<span
									className="font-mono text-xs text-muted-foreground truncate"
									title={change.coinType}
								>
									{formatCoinType(change.coinType)}
								</span>
								<CopyButton
									value={change.coinType}
									size="xs"
									className="size-3 p-0 text-muted-foreground [&_svg]:size-2.5 hover:bg-transparent hover:text-foreground"
									successMessage="Coin type copied"
								/>
							</div>
						)}
					</div>
				</div>
			</PreviewCard.Body>
			<PreviewCard.Footer
				owner={change.address}
				senderAddress={senderAddress}
			/>
		</PreviewCard.Root>
	);
}

function isAmountPositive(
	rawAmount: string | null | undefined,
): boolean {
	if (rawAmount == null) return false;
	try {
		return BigInt(rawAmount) > 0n;
	} catch {
		return false;
	}
}
