// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { CopyButton } from '@/components/ui/CopyButton';
import { cn } from '@/lib/utils';

/** A labelled read-only value, mono, with a copy button. */
export function FieldDisplay({
	label,
	value,
	copyable = true,
	copyMessage,
	className,
}: {
	label: string;
	value: string | number;
	copyable?: boolean;
	copyMessage?: string;
	className?: string;
}) {
	return (
		<div className={cn('flex flex-col gap-1.5', className)}>
			<div className="text-12 text-muted-foreground">
				{label}
			</div>
			<div className="flex items-start justify-between gap-3 rounded-lg border bg-surface px-3 py-2 font-mono text-12 break-all">
				<span className="min-w-0 leading-5">{value}</span>
				{copyable && typeof value === 'string' && (
					<CopyButton
						value={value}
						successMessage={copyMessage}
						size="xs"
						className="-mr-1 shrink-0"
					/>
				)}
			</div>
		</div>
	);
}
