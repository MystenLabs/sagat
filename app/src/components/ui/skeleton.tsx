// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from '@/lib/utils';

/**
 * Loading placeholders from the designs: flat bars on the skeleton token,
 * laid out like the content they stand in for so nothing jumps when the
 * data arrives. Text lines are 10px tall with a 4px radius, chips 14px and
 * fully round.
 */
function Skeleton({
	className,
	...props
}: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="skeleton"
			aria-hidden
			className={cn(
				'animate-pulse rounded-sm bg-skeleton',
				className,
			)}
			{...props}
		/>
	);
}

/** A single line of text. */
function SkeletonLine({
	className,
	...props
}: React.ComponentProps<'div'>) {
	return (
		<Skeleton
			className={cn('h-2.5 w-32', className)}
			{...props}
		/>
	);
}

/** A status chip. */
function SkeletonChip({
	className,
	...props
}: React.ComponentProps<'div'>) {
	return (
		<Skeleton
			className={cn('h-3.5 w-16 rounded-full', className)}
			{...props}
		/>
	);
}

/**
 * A table of `rows` rows in a bordered shell: a two-line title cell on the
 * left, then a chip and a couple of value cells, matching the proposals
 * and invitations lists. Header bars sit in cells as wide as the row cells
 * below them. `status={false}` drops the live region when a parent
 * already announces the loading.
 */
export function SkeletonRows({
	rows = 5,
	header = true,
	status = true,
	className,
	testId = 'skeleton-rows',
}: {
	rows?: number;
	header?: boolean;
	status?: boolean;
	className?: string;
	testId?: string;
}) {
	return (
		<div
			role={status ? 'status' : undefined}
			aria-label={status ? 'Loading' : undefined}
			aria-busy={status || undefined}
			data-testid={testId}
			className={cn(
				'overflow-hidden rounded-2xl border bg-card',
				className,
			)}
		>
			{header && (
				<div className="flex h-8 items-center gap-3 bg-muted px-3">
					<div className="min-w-0 flex-1">
						<SkeletonLine className="w-12" />
					</div>
					<div className="hidden w-16 shrink-0 sm:block">
						<SkeletonLine className="w-10" />
					</div>
					<div className="hidden w-20 shrink-0 md:block">
						<SkeletonLine className="w-10" />
					</div>
					<div className="w-16 shrink-0">
						<SkeletonLine className="w-10" />
					</div>
				</div>
			)}
			{Array.from({ length: rows }).map((_, i) => (
				<div
					key={i}
					className="flex h-[62px] items-center gap-3 border-b px-3 last:border-b-0"
				>
					<div className="flex min-w-0 flex-1 flex-col gap-2">
						<SkeletonLine
							className={cn(
								i % 3 === 0
									? 'w-72'
									: i % 3 === 1
										? 'w-56'
										: 'w-64',
								'max-w-full',
							)}
						/>
						<SkeletonLine className="w-24" />
					</div>
					<SkeletonChip className="hidden shrink-0 sm:block" />
					<SkeletonLine className="hidden w-20 shrink-0 md:block" />
					<SkeletonLine className="w-16 shrink-0" />
				</div>
			))}
		</div>
	);
}

/** The page header while its title is still loading. */
function SkeletonPageHeader() {
	return (
		<div className="mb-7 flex flex-col gap-3" aria-hidden>
			<SkeletonLine className="w-40" />
			<Skeleton className="h-7 w-56 rounded-md" />
			<SkeletonLine className="w-28" />
		</div>
	);
}

/** A whole page: header placeholder over a table of rows. */
export function SkeletonPage({
	rows = 5,
	message = 'Loading',
	className,
	testId = 'skeleton-page',
}: {
	rows?: number;
	message?: string;
	className?: string;
	testId?: string;
}) {
	return (
		<div
			className={cn('page-shell', className)}
			data-testid={testId}
		>
			<SkeletonPageHeader />
			<SkeletonRows
				rows={rows}
				status={false}
				testId={`${testId}-rows`}
			/>
			<span className="sr-only" role="status">
				{message}
			</span>
		</div>
	);
}

export { Skeleton, SkeletonChip, SkeletonLine };
