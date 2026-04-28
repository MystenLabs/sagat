// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { AlertCircle, ExternalLink } from 'lucide-react';
import { type ReactNode } from 'react';

import { type CoinDisplayData } from '../../hooks/useCoinDisplayData';
import {
	type Balance,
	type useMultisigBalances,
} from '../../hooks/useMultisigBalances';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import { SuiLogo } from '../ui/SuiLogo';
import { AssetRow } from './Asset';

type BalancesQuery = ReturnType<typeof useMultisigBalances>;

interface AssetsListProps {
	query: BalancesQuery;
	balances?: Balance[];
	coinDataMap: Map<string, CoinDisplayData>;
	explorerUrl: string;
	renderRowActions?: (
		balance: Balance,
		coinData: CoinDisplayData | undefined,
	) => ReactNode;
}

export function AssetsList({
	query,
	balances,
	coinDataMap,
	explorerUrl,
	renderRowActions,
}: AssetsListProps) {
	const rows = balances ?? query.balances;

	if (query.isLoading) {
		return <ListSkeleton />;
	}

	if (query.isError) {
		return (
			<ErrorState
				error={query.error}
				onRetry={() => query.refetch()}
			/>
		);
	}

	if (rows.length === 0) {
		return <EmptyAssetsState explorerUrl={explorerUrl} />;
	}

	return (
		<div className="space-y-3">
			<ul className="space-y-2">
				{rows.map((balance) => {
					const coinData = coinDataMap.get(
						balance.coinType,
					);
					return (
						<AssetRow
							key={balance.coinType}
							balance={balance}
							coinData={coinData}
							actions={renderRowActions?.(
								balance,
								coinData,
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
	error: unknown;
	onRetry: () => void;
}) {
	const message =
		error instanceof Error && error.message
			? error.message
			: 'Something went wrong while loading balances.';

	return (
		<div className="bg-card border border-error-border rounded-lg p-6 text-center">
			<AlertCircle className="w-8 h-8 mx-auto mb-3 text-error-foreground" />
			<h3 className="font-medium mb-1">
				Failed to load balances
			</h3>
			<p className="text-sm text-muted-foreground mb-4">
				{message}
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
			title="No balances yet"
			description="This multisig doesn't currently hold any coin balances. Once it receives funds they'll appear here."
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
