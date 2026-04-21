// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';

import { useCoinMetadata } from '../../../hooks/useCoinMetadata';
import { formatCoinType } from '../../assets/formatCoinType';
import { CoinIcon } from '../../ui/CoinIcon';
import { CopyButton } from '../../ui/CopyButton';
import { Skeleton } from '../../ui/skeleton';
import { PreviewCard } from '../PreviewCard';
import { onChainAmountToFloat } from '../utils';

export function BalanceChanges({
	changes,
}: {
	changes: SuiClientTypes.BalanceChange[];
}) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
			{changes.map((change, index) => (
				<ChangedBalance key={index} change={change} />
			))}
		</div>
	);
}

function ChangedBalance({
	change,
}: {
	change: SuiClientTypes.BalanceChange;
}) {
	const { data: coinMetadata, isLoading } = useCoinMetadata(
		change.coinType,
	);

	const amount = coinMetadata
		? onChainAmountToFloat(
				change.amount!,
				coinMetadata.decimals,
			)
		: null;
	const isPositive = amount != null && amount > 0;
	const formattedAmount =
		amount == null
			? '-'
			: `${isPositive ? '+' : ''}${amount}`;

	return (
		<PreviewCard.Root>
			<PreviewCard.Body>
				<div className="flex items-center gap-3">
					<CoinIcon
						iconUrl={coinMetadata?.iconUrl}
						symbol={coinMetadata?.symbol}
						coinType={change.coinType}
						size="md"
					/>

					<div className="flex-1 min-w-0 leading-tight">
						<div className="flex items-baseline gap-2 min-w-0">
							{isLoading ? (
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
									{coinMetadata?.symbol && (
										<span className="text-xs text-muted-foreground uppercase tracking-wide">
											{coinMetadata.symbol}
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
			<PreviewCard.Footer owner={change.address} />
		</PreviewCard.Root>
	);
}
