// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';

import { type CoinMetadata } from '../../hooks/useCoinMetadata';
import { type Balance } from '../../hooks/useMultisigBalances';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';
import { Skeleton } from '../ui/skeleton';
import { Asset } from './Asset';

interface AssetPickerProps {
	balances: Balance[];
	metadataMap: Map<string, CoinMetadata | null | undefined>;
	selectedCoinType: string | null;
	onSelect: (coinType: string) => void;
	disabled?: boolean;
	isLoading?: boolean;
}

/**
 * Inline picker for choosing which coin to send.
 *
 * The trigger and dropdown rows reuse `Asset` so the visual language
 * matches the assets list exactly. No external popover library — uses
 * the same outside-click pattern as `MultisigSelector`.
 */
export function AssetPicker({
	balances,
	metadataMap,
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

	const handleSelect = (coinType: string) => {
		onSelect(coinType);
		setOpen(false);
	};

	const chevron = (
		<ChevronDown
			className={`w-4 h-4 text-muted-foreground transition-transform ${
				open ? 'rotate-180' : ''
			}`}
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
					<Asset
						as="div"
						balance={selected}
						metadata={metadataMap.get(selected.coinType)}
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
							No assets available.
						</div>
					) : (
						<ul className="max-h-72 overflow-y-auto p-1">
							{balances.map((balance) => {
								const isSelected =
									balance.coinType === selectedCoinType;
								return (
									<li key={balance.coinType}>
										<button
											type="button"
											role="option"
											aria-selected={isSelected}
											onClick={() =>
												handleSelect(balance.coinType)
											}
											className="block w-full text-left cursor-pointer"
										>
											<Asset
												as="div"
												balance={balance}
												metadata={metadataMap.get(
													balance.coinType,
												)}
												showCopyButton={false}
												selected={isSelected}
												bare
											/>
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}

function EmptyTrigger({
	chevron,
}: {
	chevron: React.ReactNode;
}) {
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
