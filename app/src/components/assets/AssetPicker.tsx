// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChevronDown } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

import { useCoinDisplayData } from '../../hooks/useCoinDisplayData';
import { type Balance } from '../../hooks/useMultisigBalances';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';
import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';
import { AssetCard } from './Asset';

interface AssetPickerProps {
	balances: Balance[];
	selectedCoinType: string | null;
	onSelect: (coinType: string) => void;
	disabled?: boolean;
	isLoading?: boolean;
}

export function AssetPicker({
	balances,
	selectedCoinType,
	onSelect,
	disabled,
	isLoading,
}: AssetPickerProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useOnClickOutside(
		containerRef,
		() => setOpen(false),
		open,
	);

	const selected = selectedCoinType
		? (balances.find(
				(b) => b.coinType === selectedCoinType,
			) ?? null)
		: null;
	const { data: selectedCoinData } = useCoinDisplayData(
		selected?.coinType,
	);

	const handleSelect = (coinType: string) => {
		onSelect(coinType);
		setOpen(false);
	};

	const chevron = (
		<ChevronDown
			className={cn(
				'w-4 h-4 text-muted-foreground transition-transform',
				open && 'rotate-180',
			)}
		/>
	);

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				disabled={disabled}
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="listbox"
				aria-expanded={open}
				className="block w-full text-left cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
			>
				{isLoading && !selected ? (
					<TriggerSkeleton />
				) : selected ? (
					<AssetCard
						balance={selected}
						coinData={selectedCoinData}
						actions={chevron}
						showCopyButton={false}
					/>
				) : (
					<EmptyTrigger chevron={chevron} />
				)}
			</button>

			{open && (
				<div
					role="listbox"
					className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-popover border rounded-lg overflow-hidden"
				>
					{balances.length === 0 ? (
						<div className="px-3 py-4 text-sm text-muted-foreground text-center">
							No balances available.
						</div>
					) : (
						<ul className="max-h-72 overflow-y-auto p-1">
							{balances.map((balance) => {
								const isSelected =
									balance.coinType === selectedCoinType;
								return (
									<AssetOption
										key={balance.coinType}
										balance={balance}
										isSelected={isSelected}
										onSelect={handleSelect}
									/>
								);
							})}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}

function AssetOption({
	balance,
	isSelected,
	onSelect,
}: {
	balance: Balance;
	isSelected: boolean;
	onSelect: (coinType: string) => void;
}) {
	const { data: coinData } = useCoinDisplayData(
		balance.coinType,
	);

	return (
		<li>
			<button
				type="button"
				role="option"
				aria-selected={isSelected}
				onClick={() => onSelect(balance.coinType)}
				className="block w-full text-left cursor-pointer"
			>
				<AssetCard
					balance={balance}
					coinData={coinData}
					showCopyButton={false}
					selected={isSelected}
					bare
				/>
			</button>
		</li>
	);
}

function EmptyTrigger({ chevron }: { chevron: ReactNode }) {
	return (
		<div className="bg-card border rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/40 flex items-center gap-3">
			<div className="w-8 h-8 rounded-full bg-muted/40" />
			<span className="flex-1 text-sm text-muted-foreground">
				Choose an asset to send
			</span>
			<div className="shrink-0 flex items-center gap-2">
				{chevron}
			</div>
		</div>
	);
}

function TriggerSkeleton() {
	return (
		<div className="bg-card border rounded-lg px-3 py-2.5 flex items-center gap-3">
			<Skeleton className="w-8 h-8 rounded-full" />
			<div className="flex-1 space-y-1.5">
				<Skeleton className="h-3.5 w-24" />
				<Skeleton className="h-3 w-40" />
			</div>
			<Skeleton className="h-4 w-20" />
		</div>
	);
}
