// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

// Small pieces the preview's tab panels share.

/** The line a tab panel shows when it has nothing to list. */
export function EmptyPanel({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<p
			className="rounded-lg border px-3.5 py-3 text-13 text-muted-foreground"
			data-testid="transaction-preview-empty"
		>
			{children}
		</p>
	);
}

/** A label and its value on one line, wrapping under it on phones. */
export function Field({
	label,
	children,
	className,
}: {
	label: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				'flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3',
				className,
			)}
		>
			<span className="shrink-0 text-muted-foreground sm:w-24">
				{label}
			</span>
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
				{children}
			</div>
		</div>
	);
}

/** One argument of a command: a small muted box. */
export function ArgBox({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="flex max-w-full min-w-0 flex-col gap-0.5 rounded-md border bg-muted px-2 py-1 font-mono text-12 break-all">
			{children}
		</div>
	);
}
