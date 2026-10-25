// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { CoinIcon } from '@/components/ui/CoinIcon';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { type CoinDisplayData } from '@/hooks/useCoinDisplayData';
import { type Balance } from '@/hooks/useMultisigBalances';
import {
	coinLabels,
	sameCoinLabel,
} from '@/lib/coinDisplay';
import { formatCoinAmount } from '@/lib/coins';

/**
 * The asset to send: each balance the account holds, with its icon,
 * symbol, name (when it differs from the symbol) and balance. A
 * skeleton while the balances load.
 */
export function AssetSelect({
	id,
	balances,
	coinData,
	value,
	onValueChange,
	onClose,
	isLoading,
	invalid = false,
	describedBy,
}: {
	id?: string;
	balances: Balance[];
	coinData: ReadonlyMap<string, CoinDisplayData>;
	/** The chosen coin type, or '' for none. */
	value: string;
	onValueChange: (coinType: string) => void;
	/** The list closed, chosen or not. */
	onClose?: () => void;
	isLoading: boolean;
	invalid?: boolean;
	describedBy?: string;
}) {
	if (isLoading && balances.length === 0) {
		return (
			<div
				aria-busy
				aria-label="Loading assets"
				className="flex h-10.5 items-center gap-2 rounded-md border border-foreground/12 bg-card px-3"
			>
				<Skeleton className="size-5 rounded-full" />
				<Skeleton className="h-2.5 w-12" />
				<Skeleton className="h-2.5 w-20" />
				<Skeleton className="ml-auto h-2.5 w-28" />
			</div>
		);
	}

	const selected =
		balances.find((b) => b.coinType === value) ?? null;
	const empty = balances.length === 0;

	return (
		<Select
			value={selected ? selected.coinType : null}
			onValueChange={(next) => {
				if (typeof next === 'string') onValueChange(next);
			}}
			onOpenChange={(open) => {
				if (!open) onClose?.();
			}}
			disabled={empty}
		>
			<SelectTrigger
				id={id}
				aria-invalid={invalid || undefined}
				aria-describedby={describedBy}
				className="w-full"
				data-testid="transfer-asset-select"
				data-coin-type={selected?.coinType}
			>
				{selected ? (
					<TriggerValue
						balance={selected}
						coinData={coinData.get(selected.coinType)}
					/>
				) : (
					<span className="flex-1 text-left text-muted-foreground/70">
						{empty
							? 'No assets to send'
							: 'Choose an asset'}
					</span>
				)}
			</SelectTrigger>
			<SelectContent alignItemWithTrigger={false}>
				{balances.map((balance) => (
					<AssetOption
						key={balance.coinType}
						balance={balance}
						coinData={coinData.get(balance.coinType)}
					/>
				))}
			</SelectContent>
		</Select>
	);
}

function TriggerValue({
	balance,
	coinData,
}: {
	balance: Balance;
	coinData: CoinDisplayData | undefined;
}) {
	const { symbol, name } = coinLabels(
		balance.coinType,
		coinData,
	);
	const decimals = coinData?.decimals;
	return (
		<span className="flex min-w-0 flex-1 items-center gap-2">
			<CoinIcon
				iconUrl={coinData?.iconUrl}
				symbol={coinData?.symbol}
				coinType={balance.coinType}
				size="xs"
			/>
			<span className="shrink-0 text-14 font-medium">
				{symbol}
			</span>
			{!sameCoinLabel(symbol, name) && (
				<span className="min-w-0 truncate text-13 text-muted-foreground">
					{name}
				</span>
			)}
			<span className="ml-auto shrink-0 pl-3 text-13 text-muted-foreground tabular-nums">
				{decimals != null ? (
					`Balance ${formatCoinAmount(balance.balance, decimals)}`
				) : (
					<Skeleton className="h-2.5 w-24" />
				)}
			</span>
		</span>
	);
}

function AssetOption({
	balance,
	coinData,
}: {
	balance: Balance;
	coinData: CoinDisplayData | undefined;
}) {
	const { symbol, name } = coinLabels(
		balance.coinType,
		coinData,
	);
	const decimals = coinData?.decimals;
	return (
		<SelectItem
			value={balance.coinType}
			label={symbol}
			className="gap-3 py-1.5 pl-2 text-13 leading-tight"
			data-testid="transfer-asset-option"
			data-coin-type={balance.coinType}
		>
			<span className="flex w-full min-w-0 items-center gap-3">
				<CoinIcon
					iconUrl={coinData?.iconUrl}
					symbol={coinData?.symbol}
					coinType={balance.coinType}
					size="xs"
				/>
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-medium">
						{symbol}
					</span>
					{!sameCoinLabel(symbol, name) && (
						<span className="truncate text-12 leading-tight text-muted-foreground">
							{name}
						</span>
					)}
				</span>
				<span className="ml-auto flex shrink-0 flex-col items-end pl-3">
					<span className="font-medium tabular-nums">
						{decimals != null ? (
							formatCoinAmount(balance.balance, decimals)
						) : (
							<Skeleton className="my-0.5 h-2.5 w-20" />
						)}
					</span>
					<span className="text-12 leading-tight text-muted-foreground">
						Balance
					</span>
				</span>
			</span>
		</SelectItem>
	);
}
