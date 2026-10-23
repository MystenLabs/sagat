// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * One label and value line of a card's `dl`: the muted label on the left,
 * the value right-aligned and truncated when it runs out of room. `wrap`
 * lets a value that breaks itself (a free-text name) wrap instead. Values
 * that set their own text size override the row's.
 */
export function DetailRow({
	label,
	children,
	wrap = false,
	className,
}: {
	label: ReactNode;
	children: ReactNode;
	wrap?: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(
				'flex min-h-5.5 items-center justify-between gap-3 py-0.5 text-13',
				className,
			)}
		>
			<dt className="shrink-0 text-muted-foreground">
				{label}
			</dt>
			<dd
				className={cn(
					'min-w-0 text-right',
					!wrap && 'truncate',
				)}
			>
				{children}
			</dd>
		</div>
	);
}
