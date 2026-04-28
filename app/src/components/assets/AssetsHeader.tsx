// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ExternalLink, RefreshCw } from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

interface AssetsHeaderProps {
	count: number;
	hasMore?: boolean;
	isRefetching: boolean;
	isRefreshCooldown: boolean;
	onRefresh: () => void;
	explorerUrl: string;
	actions?: ReactNode;
}

export function AssetsHeader({
	count,
	hasMore,
	isRefetching,
	isRefreshCooldown,
	onRefresh,
	explorerUrl,
	actions,
}: AssetsHeaderProps) {
	const countLabel =
		count === 0
			? 'Balances for this multisig'
			: `${count}${hasMore ? '+' : ''} ${
					count === 1 && !hasMore ? 'balance' : 'balances'
				} tracked`;

	return (
		<div className="flex items-center justify-between gap-2">
			<div>
				<h2 className="text-lg font-semibold">Balances</h2>
				<p className="text-sm text-muted-foreground">
					{countLabel}
				</p>
			</div>
			<div className="flex items-center gap-2 shrink-0">
				{actions}
				<Button
					variant="ghost"
					size="sm"
					onClick={onRefresh}
					disabled={isRefreshCooldown || isRefetching}
					title="Refresh balances (5s cooldown)"
				>
					<RefreshCw
						className={cn(
							'w-4 h-4',
							isRefetching && 'animate-spin',
						)}
					/>
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => window.open(explorerUrl, '_blank')}
				>
					<ExternalLink className="w-4 h-4 mr-2" />
					Explorer
				</Button>
			</div>
		</div>
	);
}
