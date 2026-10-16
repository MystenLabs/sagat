// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from '@/lib/utils';

function Skeleton({
	className,
	...props
}: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="skeleton"
			className={cn(
				'animate-pulse rounded-sm bg-skeleton',
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
interface SkeletonListProps {
	count?: number;
	className?: string;
}

export function SkeletonList({
	count = 2,
	className,
}: SkeletonListProps) {
	return (
		<div className={cn('text-center py-12', className)}>
			<div className="space-y-4">
				{Array.from({ length: count }).map((_, i) => (
					<Skeleton
						key={i}
						className={cn(
							'h-8 mx-auto',
							i === 0 ? 'w-1/4' : 'w-1/2',
						)}
					/>
				))}
			</div>
		</div>
	);
}

interface SkeletonTextProps {
	lines?: number;
	className?: string;
}

export function SkeletonText({
	lines = 2,
	className,
}: SkeletonTextProps) {
	return (
		<div className={cn('space-y-2', className)}>
			{Array.from({ length: lines }).map((_, i) => (
				<Skeleton
					key={i}
					className={cn(
						'h-3',
						i === lines - 1 ? 'w-1/4' : 'w-3/4',
					)}
				/>
			))}
		</div>
	);
}
