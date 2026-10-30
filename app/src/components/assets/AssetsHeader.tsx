// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ExternalLink, RefreshCw } from 'lucide-react';
import { type ReactNode } from 'react';

import { content } from '@/content';

import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

interface AssetsHeaderProps {
	count: number;
	hasMore?: boolean;
	isRefetching: boolean;
	isRefreshCooldown: boolean;
	onRefresh: () => void;
	explorerUrl: string | null;
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
			? content.assets.header.countEmpty
			: content.assets.header.count(count, !!hasMore);

	return (
		<div className="flex items-center justify-between gap-2">
			<div>
				<h2 className="text-lg font-semibold">
					{content.assets.header.title}
				</h2>
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
					title={content.assets.header.refresh}
				>
					<RefreshCw
						className={cn(
							'w-4 h-4',
							isRefetching && 'animate-spin',
						)}
					/>
				</Button>
				{explorerUrl && (
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							window.open(explorerUrl, '_blank')
						}
					>
						<ExternalLink className="w-4 h-4 mr-2" />
						{content.assets.header.explorer}
					</Button>
				)}
			</div>
		</div>
	);
}
