// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ExternalLink, RefreshCw } from 'lucide-react';
import { type ReactNode } from 'react';

import { content } from '@/content';

import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

const COPY = content.assets.header;

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
			? COPY.countEmpty
			: COPY.count(count, !!hasMore);

	return (
		<div className="flex items-center justify-between gap-2">
			<div>
				<h2 className="text-lg font-semibold">
					{COPY.title}
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
					title={COPY.refresh}
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
						{COPY.explorer}
					</Button>
				)}
			</div>
		</div>
	);
}
