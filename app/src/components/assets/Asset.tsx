// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { type CoinMetadata } from '../../hooks/useCoinMetadata';
import { type Balance } from '../../hooks/useMultisigBalances';
import { cn } from '../../lib/utils';
import { prettifyType } from '../preview-effects/utils';
import { CoinIcon } from '../ui/CoinIcon';
import { CopyButton } from '../ui/CopyButton';
import { Skeleton } from '../ui/skeleton';
import { formatBalance } from './formatBalance';
import { formatCoinType } from './formatCoinType';

interface AssetProps {
	balance: Balance;
	metadata: CoinMetadata | null | undefined;
	/**
	 * Optional slot for per-row actions (e.g. a "Send" button or a
	 * disclosure chevron). Rendered to the right of the balance column.
	 */
	actions?: ReactNode;
	/**
	 * Show a small copy-to-clipboard button next to the coin type. Off
	 * by default since not every context (e.g. a picker dropdown) wants
	 * the affordance.
	 */
	showCopyButton?: boolean;
	/** Visual highlight for selected state (e.g. inside a picker). */
	selected?: boolean;
	/**
	 * Drop the card chrome (border + `bg-card`) and render as a flat
	 * row. Useful when the row is already nested inside another card
	 * surface (e.g. a picker dropdown) and the extra border/background
	 * just adds noise.
	 */
	bare?: boolean;
	/**
	 * Underlying element. Defaults to `li` so the assets list can render
	 * a semantically correct `<ul>`. Use `div` when nesting inside other
	 * interactive containers (e.g. a `<button>` in a picker).
	 */
	as?: 'li' | 'div';
	className?: string;
}

export function Asset({
	balance,
	metadata,
	actions,
	showCopyButton = true,
	selected = false,
	bare = false,
	as = 'li',
	className,
}: AssetProps) {
	const symbol = metadata?.symbol;
	const name = metadata?.name;
	const decimals = metadata?.decimals;
	const formatted =
		decimals != null
			? formatBalance(balance.balance, decimals)
			: null;
	const displayName =
		name ?? prettifyType(balance.coinType);
	const compactType = formatCoinType(balance.coinType);
	// When metadata is missing the displayName falls back to the coin
	// type itself, in which case repeating it on the second line is
	// just visual noise.
	const showTypeLine = displayName !== compactType;

	const Tag = as;

	return (
		<Tag
			className={cn(
				'rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover',
				!bare && 'bg-card border',
				selected && 'bg-row-selected',
				className,
			)}
		>
			<div className="flex items-center gap-3">
				<CoinIcon
					iconUrl={metadata?.iconUrl}
					symbol={symbol}
					coinType={balance.coinType}
					size="md"
				/>

				<div className="flex-1 min-w-0 leading-tight">
					<div className="flex items-center gap-2 min-w-0">
						<span className="font-medium text-foreground truncate text-sm">
							{displayName}
						</span>
						{symbol &&
							symbol.toLowerCase() !==
								displayName.toLowerCase() && (
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
		</Tag>
	);
}
