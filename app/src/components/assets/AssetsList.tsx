// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { AlertCircle, ExternalLink } from 'lucide-react';
import { type ReactNode } from 'react';

import { type CoinMetadata } from '../../hooks/useCoinMetadata';
import {
	type useMultisigBalances,
	type Balance,
} from '../../hooks/useMultisigBalances';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import { SuiLogo } from '../ui/SuiLogo';
import { Asset } from './Asset';

type BalancesQuery = ReturnType<typeof useMultisigBalances>;

interface AssetsListProps {
	query: BalancesQuery;
	metadataMap: Map<string, CoinMetadata | null | undefined>;
	explorerUrl: string;
	/**
	 * Optional render prop for per-row actions (e.g. a future "Send"
	 * button). Receives the row's balance + metadata so callers can
	 * wire context-aware actions without the list having to know
	 * what those actions are.
	 */
	renderRowActions?: (
		balance: Balance,
		metadata: CoinMetadata | null | undefined,
	) => ReactNode;
}

export function AssetsList({
	query,
	metadataMap,
	explorerUrl,
	renderRowActions,
}: AssetsListProps) {
	if (query.isLoading) {
		return <ListSkeleton />;
	}

	if (query.isError) {
		return (
			<ErrorState
				error={query.error as Error}
				onRetry={() => query.refetch()}
			/>
		);
	}

	if (query.balances.length === 0) {
		return <EmptyAssetsState explorerUrl={explorerUrl} />;
	}

	return (
		<div className="space-y-3">
			<ul className="space-y-2">
				{query.balances.map((balance) => {
					const metadata = metadataMap.get(
						balance.coinType,
					);
					return (
						<Asset
							key={balance.coinType}
							balance={balance}
							metadata={metadata}
							actions={renderRowActions?.(
								balance,
								metadata,
							)}
						/>
					);
				})}
			</ul>
			{query.hasNextPage && (
				<div className="flex items-center justify-center pt-1">
					<Button
						variant="outline"
						size="sm"
						onClick={() => query.fetchNextPage()}
						disabled={query.isFetchingNextPage}
					>
						{query.isFetchingNextPage
							? 'Loading...'
							: 'Load more'}
					</Button>
				</div>
			)}
		</div>
	);
}

function ListSkeleton() {
	return (
		<ul className="space-y-2">
			{[0, 1, 2].map((i) => (
				<li
					key={i}
					className="bg-card border rounded-lg px-3 py-2.5 flex items-center gap-3"
				>
					<Skeleton className="w-8 h-8 rounded-full" />
					<div className="flex-1 space-y-1.5">
						<Skeleton className="h-3.5 w-32" />
						<Skeleton className="h-3 w-48" />
					</div>
					<Skeleton className="h-4 w-28" />
				</li>
			))}
		</ul>
	);
}

function ErrorState({
	error,
	onRetry,
}: {
	error: Error;
	onRetry: () => void;
}) {
	return (
		<div className="bg-card border border-error-border rounded-lg p-6 text-center">
			<AlertCircle className="w-8 h-8 mx-auto mb-3 text-error-foreground" />
			<h3 className="font-medium mb-1">
				Failed to load balances
			</h3>
			<p className="text-sm text-muted-foreground mb-4">
				{error.message}
			</p>
			<Button variant="outline" size="sm" onClick={onRetry}>
				Try again
			</Button>
		</div>
	);
}

function EmptyAssetsState({
	explorerUrl,
}: {
	explorerUrl: string;
}) {
	return (
		<EmptyState
			icon={
				<div className="w-16 h-16 rounded-full bg-[#4DA2FF]/10 flex items-center justify-center">
					<SuiLogo className="h-8 w-auto" />
				</div>
			}
			title="No assets yet"
			description="This multisig doesn't currently hold any coins. Once it receives funds they'll appear here."
			action={
				<Button
					variant="outline"
					onClick={() => window.open(explorerUrl, '_blank')}
				>
					<ExternalLink className="w-4 h-4 mr-2" />
					View on Explorer
				</Button>
			}
		/>
	);
}
