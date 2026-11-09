// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	CoinTypeLine,
	VerifiedMark,
} from '@/components/assets/CoinMarks';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/ui/CoinIcon';
import {
	fieldFrame,
	inputSizes,
} from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { content } from '@/content';
import { type CoinDisplayData } from '@/hooks/useCoinDisplayData';
import { type Balance } from '@/hooks/useMultisigBalances';
import {
	coinLabels,
	sameCoinLabel,
} from '@/lib/coinDisplay';
import { formatCoinAmount } from '@/lib/coins';
import { cn } from '@/lib/utils';

const COPY = content.newProposal.assetSelect;

/**
 * The asset to send: each balance the account holds, with its icon,
 * symbol, verified mark, name (when it differs from the symbol) and
 * balance, and in the list its coin type to copy. The list shows the first
 * `listed` balances and the chosen one, with Load more for the rest. A
 * skeleton while the balances load.
 */
export function AssetSelect({
	id,
	balances,
	coinData,
	verified,
	value,
	onValueChange,
	listed,
	onLoadMore,
	onOpen,
	onClose,
	isLoading,
	disabled = false,
	invalid = false,
	describedBy,
}: {
	id: string;
	balances: Balance[];
	coinData: ReadonlyMap<string, CoinDisplayData>;
	/** Undefined while it isn't known, as without the registry. */
	verified: (coinType: string) => boolean | undefined;
	/** The chosen coin type, or '' for none. */
	value: string;
	onValueChange: (coinType: string) => void;
	/** How many balances the list shows. */
	listed: number;
	onLoadMore: () => void;
	/** The list opened. */
	onOpen: () => void;
	/** The list closed, chosen or not. */
	onClose: () => void;
	isLoading: boolean;
	disabled?: boolean;
	invalid?: boolean;
	describedBy: string | undefined;
}) {
	if (isLoading && balances.length === 0) {
		return (
			<div
				aria-busy
				aria-label={COPY.loading}
				className={cn(
					fieldFrame,
					inputSizes.md,
					'flex items-center gap-2 px-3',
				)}
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
	const shown = balances.slice(0, listed);
	// The chosen coin stays in the list even past the loaded ones.
	if (selected && !shown.includes(selected))
		shown.push(selected);

	return (
		<Select
			value={selected ? selected.coinType : null}
			onValueChange={(next) => {
				if (typeof next === 'string') onValueChange(next);
			}}
			onOpenChange={(open) => {
				if (open) onOpen();
				else onClose();
			}}
			disabled={empty || disabled}
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
						verified={verified(selected.coinType)}
					/>
				) : (
					<span className="flex-1 text-left text-muted-foreground/70">
						{empty ? COPY.noAssets : COPY.choose}
					</span>
				)}
			</SelectTrigger>
			<SelectContent alignItemWithTrigger={false}>
				{shown.map((balance) => (
					<AssetOption
						key={balance.coinType}
						balance={balance}
						coinData={coinData.get(balance.coinType)}
						verified={verified(balance.coinType)}
					/>
				))}
				{balances.length > listed && (
					<div className="flex justify-center p-1.5">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onLoadMore}
							data-testid="transfer-asset-load-more"
						>
							{content.common.actions.loadMore}
						</Button>
					</div>
				)}
			</SelectContent>
		</Select>
	);
}

function TriggerValue({
	balance,
	coinData,
	verified,
}: {
	balance: Balance;
	coinData: CoinDisplayData | undefined;
	verified: boolean | undefined;
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
				recognized={coinData?.recognized}
				badge={false}
				size="xs"
			/>
			<SymbolLine
				symbol={symbol}
				name={name}
				verified={verified}
				symbolClassName="text-14"
				nameClassName="text-13"
			/>
			<span className="shrink-0 pl-3 text-13 text-muted-foreground tabular-nums">
				{decimals != null ? (
					COPY.balance(
						formatCoinAmount(balance.balance, decimals),
					)
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
	verified,
}: {
	balance: Balance;
	coinData: CoinDisplayData | undefined;
	verified: boolean | undefined;
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
					recognized={coinData?.recognized}
					badge={false}
					size="xs"
				/>
				{/* Takes what the balance leaves: long text truncates rather
				    than widening the option. */}
				<span className="flex min-w-0 grow flex-col gap-0.5 contain-inline-size">
					<SymbolLine
						symbol={symbol}
						name={name}
						verified={verified}
						symbolClassName="text-13"
						nameClassName="text-12"
					/>
					<CoinTypeLine coinType={balance.coinType} />
				</span>
				<span className="flex shrink-0 flex-col items-end pl-3">
					<span className="font-medium tabular-nums">
						{decimals != null ? (
							formatCoinAmount(balance.balance, decimals)
						) : (
							<Skeleton className="my-0.5 h-2.5 w-20" />
						)}
					</span>
					<span className="text-12 leading-tight text-muted-foreground">
						{content.common.fields.balance}
					</span>
				</span>
			</span>
		</SelectItem>
	);
}

/**
 * SYMBOL ✓ Name, the name taking what the symbol leaves. `grow` also fills
 * the row, which puts what follows at its far end.
 */
function SymbolLine({
	symbol,
	name,
	verified,
	symbolClassName,
	nameClassName,
}: {
	symbol: string;
	name: string;
	verified: boolean | undefined;
	symbolClassName: string;
	nameClassName: string;
}) {
	return (
		<span className="flex min-w-0 grow items-center gap-1.5 contain-inline-size">
			<span
				className={cn(
					'min-w-0 truncate font-medium',
					symbolClassName,
				)}
			>
				{symbol}
			</span>
			<VerifiedMark verified={verified} />
			{!sameCoinLabel(symbol, name) && (
				<span
					className={cn(
						'grow truncate text-muted-foreground contain-inline-size',
						nameClassName,
					)}
				>
					{name}
				</span>
			)}
		</span>
	);
}
