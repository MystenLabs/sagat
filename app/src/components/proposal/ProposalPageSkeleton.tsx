// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { cardClass } from '@/components/ui/card';
import {
	Skeleton,
	SkeletonChip,
	SkeletonLine,
} from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The proposal page while it loads: the header's lines, the preview
 * card on the left and the approvals and activity cards on the right.
 */
export function ProposalPageSkeleton() {
	return (
		<div
			className="page-shell"
			data-testid="proposal-page-loading"
		>
			<div className="mb-6 flex flex-col gap-3" aria-hidden>
				<SkeletonLine className="w-20" />
				<Skeleton className="h-7 w-full max-w-120 rounded-md" />
				<div className="flex flex-wrap items-center gap-2">
					<SkeletonChip />
					<SkeletonLine className="w-28" />
					<SkeletonLine className="w-20" />
					<SkeletonLine className="w-28" />
				</div>
			</div>
			<div
				className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]"
				aria-hidden
			>
				<div className={cardClass}>
					<SkeletonLine className="w-32" />
					<div className="flex gap-2">
						<Skeleton className="h-7 w-32 rounded-full" />
						<Skeleton className="h-7 w-28 rounded-full" />
					</div>
					<div className="flex flex-col gap-4 rounded-lg border p-4">
						{['w-72', 'w-48', 'w-56', 'w-12', 'w-20'].map(
							(width, i) => (
								<div key={i} className="flex gap-6">
									<SkeletonLine className="w-16 shrink-0" />
									<SkeletonLine
										className={cn('max-w-full', width)}
									/>
								</div>
							),
						)}
					</div>
					<Skeleton className="h-9 w-full rounded-lg" />
				</div>
				<div className="flex flex-col gap-4">
					<div className={cardClass}>
						<div className="flex items-center justify-between">
							<SkeletonLine className="w-20" />
							<SkeletonLine className="w-20" />
						</div>
						<SkeletonLine className="w-32" />
						<div className="border-t" />
						{Array.from({ length: 5 }).map((_, i) => (
							<div
								key={i}
								className="flex items-center gap-3"
							>
								<Skeleton className="size-7 shrink-0 rounded-full" />
								<div className="flex flex-1 flex-col gap-1.5">
									<SkeletonLine className="w-16" />
									<SkeletonLine className="w-24" />
								</div>
								{i === 0 ? (
									<SkeletonChip />
								) : (
									<SkeletonLine className="w-14" />
								)}
							</div>
						))}
					</div>
					<div className={cardClass}>
						<SkeletonLine className="w-16" />
						{[0, 1].map((i) => (
							<div
								key={i}
								className="flex items-center gap-2.5"
							>
								<Skeleton className="size-1.5 rounded-full" />
								<SkeletonLine className="w-36" />
								<SkeletonLine className="ml-auto w-16" />
							</div>
						))}
					</div>
				</div>
			</div>
			<span className="sr-only" role="status">
				Loading proposal
			</span>
		</div>
	);
}
