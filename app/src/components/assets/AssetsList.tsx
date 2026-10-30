// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ExternalLink } from 'lucide-react';
import { type ReactNode } from 'react';

import { content } from '@/content';

import { useNetwork } from '../../contexts/NetworkContext';
import {
	useCoinDisplayData,
	type CoinDisplayData,
} from '../../hooks/useCoinDisplayData';
import {
	type Balance,
	type useMultisigBalances,
} from '../../hooks/useMultisigBalances';
import { getExplorerUrl } from '../../lib/utils';
import { Button } from '../ui/button';
import { EmptyState, ErrorState } from '../ui/empty-state';
import { Skeleton, SkeletonLine } from '../ui/skeleton';
import { SuiLogo } from '../ui/SuiLogo';
import { AssetRow } from './Asset';

type BalancesQuery = ReturnType<typeof useMultisigBalances>;

interface AssetsListProps {
	query: BalancesQuery;
	balances?: Balance[];
	multisigAddress: string;
	renderRowActions?: (
		balance: Balance,
		coinData: CoinDisplayData | undefined,
	) => ReactNode;
}

export function AssetsList({
	query,
	balances,
	multisigAddress,
	renderRowActions,
}: AssetsListProps) {
	const rows = balances ?? query.balances;

	if (query.isLoading) {
		return <ListSkeleton />;
	}

	if (query.isError) {
		return (
			<ErrorState
				title={content.assets.list.loadFailed}
				error={query.error}
				onRetry={() => query.refetch()}
				testId="assets-error"
			/>
		);
	}

	if (rows.length === 0) {
		return (
			<EmptyAssetsState multisigAddress={multisigAddress} />
		);
	}

	return (
		<div className="space-y-3">
			<ul className="space-y-2">
				{rows.map((balance) => (
					<AssetRowWithCoinData
						key={balance.coinType}
						balance={balance}
						renderRowActions={renderRowActions}
					/>
				))}
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
							? content.assets.list.loadingMore
							: content.assets.list.loadMore}
					</Button>
				</div>
			)}
		</div>
	);
}

function AssetRowWithCoinData({
	balance,
	renderRowActions,
}: {
	balance: Balance;
	renderRowActions?: (
		balance: Balance,
		coinData: CoinDisplayData | undefined,
	) => ReactNode;
}) {
	const { data: coinData } = useCoinDisplayData(
		balance.coinType,
	);

	return (
		<AssetRow
			balance={balance}
			coinData={coinData}
			actions={renderRowActions?.(balance, coinData)}
		/>
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
					<Skeleton className="size-8 rounded-full" />
					<div className="flex flex-1 flex-col gap-2">
						<SkeletonLine className="w-32" />
						<SkeletonLine className="w-48" />
					</div>
					<SkeletonLine className="w-28" />
				</li>
			))}
		</ul>
	);
}

function EmptyAssetsState({
	multisigAddress,
}: {
	multisigAddress: string;
}) {
	const { network } = useNetwork();
	const explorerUrl = getExplorerUrl(
		multisigAddress,
		network,
		'account',
	);

	return (
		<EmptyState
			icon={SuiLogo}
			iconClassName="bg-sui/10"
			title={content.assets.list.emptyTitle}
			description={content.assets.list.emptyDescription}
			testId="assets-empty"
			action={
				explorerUrl && (
					<Button
						variant="outline"
						onClick={() =>
							window.open(explorerUrl, '_blank')
						}
					>
						<ExternalLink />
						{content.common.viewOnExplorer}
					</Button>
				)
			}
		/>
	);
}
