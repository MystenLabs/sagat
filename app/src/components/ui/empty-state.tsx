// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode } from 'react';

import { cn } from '../../lib/utils';

interface EmptyStateProps {
	icon?: ReactNode;
	title: string;
	description?: string;
	action?: ReactNode;
	className?: string;
}

export function EmptyState({
	icon,
	title,
	description,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				'text-center py-12 bg-surface rounded-lg',
				className,
			)}
		>
			{icon && (
				<div className="mb-4 flex justify-center">
					{icon}
				</div>
			)}
			<h3 className="text-lg font-medium text-foreground mb-2">
				{title}
			</h3>
			{description && (
				<p className="text-muted-foreground mb-4">
					{description}
				</p>
			)}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}
