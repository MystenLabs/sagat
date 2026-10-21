// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

const SIZES = {
	/** 12px label over a 14px value: the invitation review and wizard. */
	sm: {
		root: 'gap-0.5',
		label: 'text-12',
		value: 'text-14 font-medium',
	},
	/** 13px label over a 16px value: the account overview strip. */
	md: {
		root: 'gap-1',
		label: 'text-13 whitespace-nowrap',
		value:
			'flex min-w-0 text-16 font-medium whitespace-nowrap',
	},
} as const;

/** A label over its value, inside a `<dl>`. */
export function Stat({
	label,
	children,
	size = 'sm',
	className,
}: {
	label: string;
	children: ReactNode;
	size?: keyof typeof SIZES;
	className?: string;
}) {
	const s = SIZES[size];
	return (
		<div
			className={cn(
				'flex min-w-0 flex-col',
				s.root,
				className,
			)}
		>
			<dt className={cn('text-muted-foreground', s.label)}>
				{label}
			</dt>
			<dd className={s.value}>{children}</dd>
		</div>
	);
}
